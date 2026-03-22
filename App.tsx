import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Magnetometer } from 'expo-sensors';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import Svg, { Polyline } from 'react-native-svg';

type Vector3 = {
  x: number;
  y: number;
  z: number;
};

type Sample = Vector3 & {
  t: number;
  m: number;
};

const UPDATE_INTERVAL_MS = 100;
const MAX_SAMPLES = 240;
const CALIBRATION_MS = 8000;

function format(value: number): string {
  return value.toFixed(2);
}

function magnitude(v: Vector3): number {
  return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
}

function toPoints(data: number[], width: number, height: number): string {
  if (data.length < 2) {
    return `0,${height / 2} ${width},${height / 2}`;
  }

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = Math.max(0.001, max - min);

  return data
    .map((value, index) => {
      const x = (index / (data.length - 1)) * width;
      const normalized = (value - min) / range;
      const y = height - normalized * height;
      return `${x},${y}`;
    })
    .join(' ');
}

export default function App() {
  const [raw, setRaw] = useState<Vector3>({ x: 0, y: 0, z: 0 });
  const [offset, setOffset] = useState<Vector3>({ x: 0, y: 0, z: 0 });
  const [samples, setSamples] = useState<Sample[]>([]);
  const [isCalibrating, setIsCalibrating] = useState(false);

  useEffect(() => {
    Magnetometer.setUpdateInterval(UPDATE_INTERVAL_MS);
    const sub = Magnetometer.addListener((next) => {
      const current = { x: next.x, y: next.y, z: next.z };
      setRaw(current);
    });

    return () => sub.remove();
  }, []);

  const corrected = useMemo(
    () => ({
      x: raw.x - offset.x,
      y: raw.y - offset.y,
      z: raw.z - offset.z,
    }),
    [raw, offset]
  );

  const totalB = useMemo(() => magnitude(corrected), [corrected]);

  useEffect(() => {
    const point: Sample = {
      ...corrected,
      m: totalB,
      t: Date.now(),
    };

    setSamples((prev) => [...prev.slice(-(MAX_SAMPLES - 1)), point]);
  }, [corrected, totalB]);

  const chartData = useMemo(() => samples.map((s) => s.m), [samples]);

  const setCurrentAsZero = () => {
    setOffset(raw);
  };

  const startCalibration = async () => {
    if (isCalibrating) {
      return;
    }

    setIsCalibrating(true);

    const minVals: Vector3 = { x: Number.POSITIVE_INFINITY, y: Number.POSITIVE_INFINITY, z: Number.POSITIVE_INFINITY };
    const maxVals: Vector3 = { x: Number.NEGATIVE_INFINITY, y: Number.NEGATIVE_INFINITY, z: Number.NEGATIVE_INFINITY };

    const tempSamples: Vector3[] = [];
    const tempSub = Magnetometer.addListener((next) => {
      tempSamples.push(next);
      minVals.x = Math.min(minVals.x, next.x);
      minVals.y = Math.min(minVals.y, next.y);
      minVals.z = Math.min(minVals.z, next.z);
      maxVals.x = Math.max(maxVals.x, next.x);
      maxVals.y = Math.max(maxVals.y, next.y);
      maxVals.z = Math.max(maxVals.z, next.z);
    });

    await new Promise((resolve) => setTimeout(resolve, CALIBRATION_MS));

    tempSub.remove();

    if (tempSamples.length < 10) {
      Alert.alert('Calibration failed', 'Not enough sensor data was captured.');
      setIsCalibrating(false);
      return;
    }

    setOffset({
      x: (maxVals.x + minVals.x) / 2,
      y: (maxVals.y + minVals.y) / 2,
      z: (maxVals.z + minVals.z) / 2,
    });

    setIsCalibrating(false);
    Alert.alert('Calibration complete', 'Move the phone in a figure-eight for best results.');
  };

  const exportCsv = async () => {
    if (samples.length === 0) {
      Alert.alert('No data', 'There are no samples to export yet.');
      return;
    }

    const header = 'timestamp_ms,x_uT,y_uT,z_uT,magnitude_uT';
    const rows = samples.map((s) => `${s.t},${s.x.toFixed(4)},${s.y.toFixed(4)},${s.z.toFixed(4)},${s.m.toFixed(4)}`);
    const csv = [header, ...rows].join('\n');

    const baseDir = FileSystem.cacheDirectory ?? FileSystem.documentDirectory;
    if (!baseDir) {
      Alert.alert('Export error', 'No writable directory found on this device.');
      return;
    }

    const uri = `${baseDir}magnetometer_${Date.now()}.csv`;
    await FileSystem.writeAsStringAsync(uri, csv, {
      encoding: FileSystem.EncodingType.UTF8,
    });

    const canShare = await Sharing.isAvailableAsync();
    if (canShare) {
      await Sharing.shareAsync(uri, {
        mimeType: 'text/csv',
        dialogTitle: 'Export magnetic field data',
      });
      return;
    }

    Alert.alert(
      'CSV saved',
      Platform.select({
        web: 'Sharing is not available in web mode.',
        default: `CSV file path: ${uri}`,
      })
    );
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Magnetic Field Meter</Text>
        <Text style={styles.subtitle}>Values are shown in microtesla (uT)</Text>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Live Sensor Values</Text>
          <Text style={styles.row}>X: {format(corrected.x)}</Text>
          <Text style={styles.row}>Y: {format(corrected.y)}</Text>
          <Text style={styles.row}>Z: {format(corrected.z)}</Text>
          <Text style={styles.magnitude}>|B|: {format(totalB)} uT</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Live Magnitude Chart</Text>
          <Svg width="100%" height={180} viewBox="0 0 320 180">
            <Polyline
              points={toPoints(chartData, 320, 180)}
              fill="none"
              stroke="#1b6ca8"
              strokeWidth={3}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          </Svg>
        </View>

        <View style={styles.buttonRow}>
          <Pressable style={styles.button} onPress={setCurrentAsZero}>
            <Text style={styles.buttonText}>Set current as zero</Text>
          </Pressable>

          <Pressable style={[styles.button, isCalibrating && styles.buttonDisabled]} onPress={startCalibration} disabled={isCalibrating}>
            <Text style={styles.buttonText}>{isCalibrating ? 'Calibrating...' : '8s calibration'}</Text>
          </Pressable>
        </View>

        <Pressable style={[styles.button, styles.exportButton]} onPress={exportCsv}>
          <Text style={styles.buttonText}>Export CSV</Text>
        </Pressable>

        <Text style={styles.info}>Samples in memory: {samples.length}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#eef3f8',
  },
  container: {
    padding: 16,
    paddingBottom: 28,
    gap: 14,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#12263a',
  },
  subtitle: {
    color: '#36566f',
    fontSize: 14,
  },
  card: {
    borderRadius: 14,
    backgroundColor: '#ffffff',
    padding: 14,
    shadowColor: '#001e3a',
    shadowOpacity: 0.1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#12263a',
    marginBottom: 8,
  },
  row: {
    fontSize: 17,
    color: '#173042',
  },
  magnitude: {
    fontSize: 22,
    fontWeight: '700',
    marginTop: 8,
    color: '#1b6ca8',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 10,
  },
  button: {
    flex: 1,
    backgroundColor: '#204e7a',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  exportButton: {
    backgroundColor: '#157347',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#ffffff',
    fontWeight: '600',
  },
  info: {
    color: '#45667d',
    fontSize: 13,
  },
});
