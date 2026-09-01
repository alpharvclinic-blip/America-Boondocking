# Data policy

This app intentionally does not ship a fabricated location list.

The API queries OpenStreetMap through Overpass and only returns records that:

- are tagged `caravan=yes` or `motorhome=yes`;
- do not have a `fee=yes` or `membership=yes` tag and are not marked private; and
- are mapped as retail, fuel, or parking infrastructure.

OpenStreetMap data is community-maintained and is not proof that a property currently permits overnight stays. The interface therefore shows the source record, data caveat, and a report flow instead of claiming that every result is guaranteed. Reports are written to `data/reports.ndjson` in local/self-hosted deployments and should be wired to durable storage before a multi-user deployment.