# Fizika_projekt

Expo React Native app magnetometer mereshez (JavaScript alapon).

## Funkciok

- Elo x/y/z magnetometer ertekek megjelenitese (uT)
- Teljes tererosseg szamitas: |B| = sqrt(x^2 + y^2 + z^2)
- Kalibracio:
	- Set current as zero
	- 8 masodperces min/max alapu offset kalibracio
- CSV export (timestamp, x, y, z, |B|)
- Elo vonalgrafikon az |B| idosorra

## Inditas

1. Node.js 20+ ajanlott.
2. Fuggosegek telepitese:

```bash
npm install
```

3. Expo SDK-kompatibilis szenzor csomagok telepitese:

```bash
npx expo install expo-sensors expo-file-system expo-sharing react-native-svg
```

4. Dev szerver inditas:

```bash
npm run start
```

5. Telefonon Expo Go appban olvasd be a QR kodot.

## Fontos megjegyzesek

- A szenzor adatok zajosak lehetnek fem targyak vagy eros elektromagneses forrasok kozeleben.
- Pontosabb mereshez mozgas kozben idonkent kalibralj (pl. 8-as mozdulat).
- Weben a magnetometer korlatozott vagy nem elerheto; fizikai telefon ajanlott.