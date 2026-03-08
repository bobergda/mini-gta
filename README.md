# Mini GTA 3D

Przeglądarkowy sandbox 3D zbudowany w `Three.js` i `Vite`. Miasto, ruch pieszy, auta, pickupy, wanted level i policyjny pościg są generowane proceduralnie w stylistyce low-poly.

## Uruchomienie

```bash
npm install
npm run dev
```

Domyślny adres deweloperski:

```text
http://localhost:5173
```

Build produkcyjny:

```bash
npm run build
```

Testy jednostkowe:

```bash
npm run test
```

## Sterowanie

- `WASD`: ruch / jazda
- `Shift`: sprint pieszo
- `E`: wejście do auta / wyjście z auta
- `Spacja`: hamulec ręczny
- przeciągnięcie myszą po scenie: obrót kamery
- kółko myszy: zoom kamery

## Co działa w v1

- third-person kamera dla pieszego i auta
- proceduralne miasto 3D low-poly
- chodzenie po mieście i kradzież aut
- ruch uliczny po pasach i skrzyżowaniach
- piesi poruszający się po chodnikach
- pickupy z gotówką
- wanted level i spawn policji
- podstawowe kolizje i game over
