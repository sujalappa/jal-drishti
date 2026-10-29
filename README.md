# Jal-drishti AI

Every ~1 km stretch of a city's rivers and lakes, every month, from Sentinel-2.

For each stretch it measures three things:
- **Floating weed (water hyacinth) cover:** share of the water channel with NDVI > 0.3.
- **Turbidity:** NDTI over open water, compared with the same month in 2019-2023.
- **Chlorophyll / algae:** NDCI over open water, compared the same way.

It flags stretches to **sample first** (heavy weed, or unusual turbidity or algae). A **cleanup check** compares weed cover before and after a removal drive or a new sewage plant. The method follows NASA ARSET's *Monitoring Water Quality of Inland Lakes using Remote Sensing* (2023).

Satellites see optical proxies only. BOD, dissolved oxygen and coliforms still need water samples. Jal-drishti tells the pollution board where and when to take them.

Cities: Pune and Pimpri-Chinchwad, Mumbai, Thane–Kalyan–Ulhasnagar, Nashik, Nagpur, Kolhapur.

## Data sources

| Dataset | Provider | Used for | Licence |
|---|---|---|---|
| Sentinel-2 L2A (harmonized) | ESA / Copernicus | Channel, weed, turbidity, chlorophyll | Copernicus open licence |
| Cloud Score+ | Google | Cloud masking | CC BY 4.0 |
| ESA WorldCover 2021 | ESA | Excludes trees and mangroves from weed cover | CC BY 4.0 |
| NDTI (Lacaux et al. 2007), NDCI (Mishra & Mishra 2012) | Peer-reviewed methods | Turbidity and chlorophyll indices | – |
| NASA ARSET inland water quality training (2023) | NASA | Method basis and calibration approach | – |
| Indian Village Boundaries | DataMeet | Names for stretches | ODbL |

## Run locally

```bash
cd frontend && npm install && npm run build && cd ..
cp .env.example .env               # set GEE_PROJECT; run `earthengine authenticate` once
cd backend && uvicorn jaldrishti.api:app --port 8200
```

Open http://localhost:8200. Tests: `cd backend && python -m pytest tests -q`.

## Layout

- `backend/jaldrishti/water.py`: channel, stretches, monthly indicators, flags
- `backend/jaldrishti/pipelines.py`: the job, maps, PDF, CSV, GeoJSON and KML
- `frontend/`: React + MapLibre web app
- `research/NOTES.md`: problem evidence and sources
- `presentation/`: Seva Innovation Challenge 2026 deck
