# Jal-drishti AI: research notes

Problem statement 2 for the Seva Innovation Challenge 2026:
**Urban Development → Sewage, urban water pollution and wastewater reuse.**

Working name: **Jal-drishti AI** ("jal" = water; same family as Van-drishti and Pik-drishti).

## The problem, with sources

| Fact | Source |
|---|---|
| Maharashtra generates ~9,271 MLD of sewage; 173 STPs with 7,215 MLD capacity treat ~5,024 MLD, leaving a gap of ~4,247 MLD | [MPCB monthly progress report, Dec 2025](https://www.mpcb.gov.in/sites/default/files/MPR_Merged_Dec_2025.pdf) |
| "Half of the sewage ... goes into the State's rivers untreated": 9,190 MLD generated, ~4,846 MLD treated; 50 new STPs under construction; a State River Rejuvenation Authority approved | [The Hitavada, 14 Dec 2025](https://www.thehitavada.com/Encyc/2025/12/14/ejuvenating-ivers-construction-of-50-new-sewage-treatment-plants-underway.html) |
| 54 polluted river stretches (PRS), the most of any state; the worst are in the Mumbai region (Mithi, Dahisar, Poisar, Oshiwara, Ulhas); nationally PRS fell from 311 to 296 | [Drishti IAS summary of the CPCB 2025 report, Sep 2025](https://www.drishtiias.com/state-pcs-current-affairs/maharashtra-leads-in-river-pollution/print_manually); MPCB monthly reports |
| 2018 baseline: Maharashtra had 53 of India's 351 PRS; priority-1 stretches mostly in the Mumbai region and Pune (Mithi, Mula, Mula-Mutha, Ulhas) | [Down To Earth](https://www.downtoearth.org.in/amp/story/water/351-polluted-river-stretches-in-india-a-list-across-states-78083) |
| MPCB runs 272 water-quality stations (173 on rivers), sampled **monthly**; groundwater every six months | [MPCB water bulletin, Jan 2026](https://www.mpcb.gov.in/sites/default/files/Jan26_Water_Eng.pdf); [MPCB NWMP/SWMP circular](https://www.mpcb.gov.in/sites/default/files/standing_orders/Circular_Waterqualitymonitoring_NWMP_SWMP.pdf) |
| Mula is monitored at two locations, monthly (CPCB reply to NGT) | [CPCB reply in OA 214/2024](https://www.greentribunal.gov.in/sites/default/files/news_updates/Reply%20of%20CPCB%20in%20OA%20214-2024%20(page%20nos.%2020-32).pdf) |
| Pune: MPCB found untreated sewage entering through 10 major nullahs and told PMC to fix the gaps in six months | [Free Press Journal](https://www.freepressjournal.in/amp/pune/pune-pmc-told-to-fix-sewage-gaps-in-6-months-pashan-stp-leak-sparks-concern-video) |
| Pune: ₹8 crore spent on water hyacinth removal, yet it persists; former corporators want a review before contractors are paid (Jun 2026); the NCP-SP demanded the tender be cancelled (Aug 2026); PMC set aside ₹2.5 crore more in Dec 2025 | [Punekar News](https://www.punekarnews.in/rs-8-crore-spent-yet-water-hyacinth-persists-in-punes-rivers-and-lakes-former-corporators/); [Free Press Journal](https://www.freepressjournal.in/pune/pune-ncp-sp-demands-scrapping-of-pmcs-water-hyacinth-tender-supriya-sule-targets-govt-over-potholes) |
| A joint committee (NGT case) inspected the Mula from Hinjawadi to Sangam bridge on 1 Jun 2026; it found the water quality deteriorating from untreated and treated sewage of the PMRDA and Pimpri-Chinchwad catchment | [Down To Earth court digest, 13 Jul 2026](https://www.downtoearth.org.in/environment/daily-court-digest-major-environment-orders-july-13-2026) |

The figures differ between MPCB reports (9,190 vs 9,271 MLD), so the slide uses "~4,250 MLD" with the Dec 2025 report as its source.

## What satellites can and cannot see

- **Can see:**
  - Floating weeds (water hyacinth): high NDVI on the water surface.
  - Suspended sediment and turbidity: red reflectance, NDTI.
  - Algal blooms from sewage nutrients: chlorophyll via red-edge, NDCI.
  - Unusual water colour.
  - Changes over time, at every point of the river, every few days (Sentinel-2, 10-20 m).
- **Cannot see directly:** BOD, dissolved oxygen, faecal coliform. They are not optical. Satellites give proxies and tell officials *where and when* to sample, not a lab result.
- **Width limit:** at 10 m pixels, rivers narrower than ~30 m (Mithi in places, Nag) are hard. Wider stretches work: Mula-Mutha, Ulhas, Godavari, Wainganga, Panchganga, plus lakes and creeks.
- **Hyperspectral (EnMAP, PRISMA, 30 m):** separates pollution types better, but scenes come by request, not on a fixed schedule. A later layer, not the base.

## Prior work

- Sentinel-2 hyacinth mapping is established with NDVI / FAI and machine learning. Examples:
  - Indian wetlands with Sentinel-1 and Sentinel-2 ([Strathclyde](https://strathprints.strath.ac.uk/id/eprint/80008)).
  - Letaba River, ~80% accuracy ([MDPI](https://mdpi-res.com/d_attachment/remotesensing/remotesensing-14-03013/article_deploy/remotesensing-14-03013.pdf)).
  - Genus-level mapping in California ([AGRIS](https://agris.fao.org/search/es/records/65df0aaf0f3e94b9e5d44d92)).
- Indian water quality with GEE: NDTI / NDCI in Chilika ([IJGI 2024](https://mdpi-res.com/d_attachment/ijgi/ijgi-13-00381/article_deploy/ijgi-13-00381.pdf)) and on the Ganga after Chamoli ([PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC8381862)).
- NASA ARSET trainings on PACE / hyperspectral water quality (see the Pik-drishti notes).

## Prototype idea (reuses the Pik-drishti / Van-drishti stack)

1. **River channel:** the area that was open water in Sentinel-2 at any time since 2019. The monsoon flushes the hyacinth out, so covered reaches still show up. This avoids depending on OpenStreetMap, whose servers timed out.
2. **River segments:** ~1 km stretches plus lakes.
3. **Monthly indicators per segment:**
   - Hyacinth cover % (NDVI on water).
   - Turbidity index (NDTI).
   - Chlorophyll index (NDCI).
   - Each compared with the same month in earlier years.
4. **Outputs:**
   - Hotspot stretches: where to sample next.
   - Cleanup verification: hyacinth cover before and after a removal contract.
   - Trend since STP commissioning.
   - Map, PDF, CSV, KML.
5. **Validation:** MPCB's monthly station data for the same stretches.

## Prototype results (28 Oct 2026)

- **Pune and Pimpri-Chinchwad:**
  - 158 stretches, 1,139 ha of water, 24 months (Nov 2024 – Oct 2026), ~80 s per run.
  - 13 stretches to sample first and 41 to watch in Oct 2026, after excluding bank pixels from water colour (it was 20 and 51 before). 105 of 158 stretches are wide enough for water-colour values; the rest are judged on weed cover only.
  - Citywide floating weed follows a clear cycle: 6–8% of visible water after the monsoon, rising to 27–29% by May–June in both 2025 and 2026. No year-on-year improvement at city scale.
  - Pashan Lake shows heavy weed cover, which matches news reports.
- **Nagpur:**
  - 23 lake and river stretches.
  - In Oct 2026 the big lakes show chlorophyll (NDCI) 3–5 standard deviations above their 2019-2023 normal. This may fit the weak 2026 monsoon, but it needs water samples to confirm.
- **Method basis:** NASA ARSET, [Monitoring Water Quality of Inland Lakes using Remote Sensing](https://www.earthdata.nasa.gov/learn/trainings/monitoring-water-quality-inland-lakes-using-remote-sensing) (2023). It uses Sentinel-2 and Landsat indices in GEE for chlorophyll-a, turbidity and TSS, calibrated against in-situ samples. Next step: regress our indices on MPCB monthly station data.
- **Not yet validated** against MPCB lab results. OpenStreetMap river names were not available: the Overpass servers timed out or refused connections from this machine.

## Update 29 Oct 2026: NASA ARSET hyperspectral Q&A (2021, part 3)

What we took from it:
- **Edge pixels (Q53):** pixels at river and lake edges mix land and water, so avoid them. Now done: turbidity and chlorophyll use only pixels one 20 m pixel in from the bank.
- **Local calibration (Q38, Q6, Q15):** standard chlorophyll products are not calibrated to a region; calibrate with local samples. This is the pilot step with MPCB.
- **Atmospheric correction over water (Q8, Q34, Q47):** land-oriented correction is less accurate over water ([Palacios et al. 2015](https://www.sciencedirect.com/science/article/pii/S0034425715300146)). Listed as a limitation; ACOLITE is a planned upgrade.
- **Drone hyperspectral is hard (Q7, Q27):** cost, platform stability, sun glint, georeferencing and small coverage. This supports "satellite first, drones only for flagged spots".
- **Further trainings:** [Mapping and Monitoring Lakes and Reservoirs](https://appliedsciences.nasa.gov/join-mission/training/english/mapping-and-monitoring-lakes-and-reservoirs-satellite-observations), [Remote Sensing of Freshwater Habitats](https://appliedsciences.nasa.gov/join-mission/training/english/remote-sensing-freshwater-habitats).
