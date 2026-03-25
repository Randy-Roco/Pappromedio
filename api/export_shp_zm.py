from flask import Flask, request, send_file, jsonify
import io
import os
import tempfile
import zipfile
import shapefile

app = Flask(__name__)

WKT_BY_EPSG = {
    "EPSG:32719": 'PROJCS["WGS_1984_UTM_Zone_19S",GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137.0,298.257223563]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]],PROJECTION["Transverse_Mercator"],PARAMETER["False_Easting",500000.0],PARAMETER["False_Northing",10000000.0],PARAMETER["Central_Meridian",-69.0],PARAMETER["Scale_Factor",0.9996],PARAMETER["Latitude_Of_Origin",0.0],UNIT["Meter",1.0]]',
    "EPSG:32718": 'PROJCS["WGS_1984_UTM_Zone_18S",GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137.0,298.257223563]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]],PROJECTION["Transverse_Mercator"],PARAMETER["False_Easting",500000.0],PARAMETER["False_Northing",10000000.0],PARAMETER["Central_Meridian",-75.0],PARAMETER["Scale_Factor",0.9996],PARAMETER["Latitude_Of_Origin",0.0],UNIT["Meter",1.0]]',
}


def safe_float(value, default=0.0):
    try:
        return float(value)
    except Exception:
        return default


@app.route("/api/export_shp_zm", methods=["POST"])
def export_shp_zm():
    try:
        payload = request.get_json(force=True)
        rows = payload.get("rows", [])
        epsg = payload.get("epsg", "EPSG:32719")

        if not rows:
            return jsonify({"error": "No hay filas para exportar."}), 400

        layer_name = "PA_PROMEDIADOS"
        prj_wkt = WKT_BY_EPSG.get(epsg, WKT_BY_EPSG["EPSG:32719"])

        with tempfile.TemporaryDirectory() as tmpdir:
            shp_base = os.path.join(tmpdir, layer_name)

            writer = shapefile.Writer(shp_base, shapeType=shapefile.POINTZ)
            writer.autoBalance = 1

            writer.field("X", "F", size=18, decimal=4)
            writer.field("Y", "F", size=18, decimal=4)
            writer.field("Z", "F", size=18, decimal=4)
            writer.field("DESCRIPTOR", "C", size=50)
            writer.field("OBSERV", "N", size=10, decimal=0)
            writer.field("DELTAMAX", "F", size=18, decimal=4)
            writer.field("CONTROL", "C", size=20)

            for row in rows:
                x = safe_float(row.get("X"))
                y = safe_float(row.get("Y"))
                z = safe_float(row.get("Z"))
                descriptor = str(row.get("descriptor", ""))
                observ = int(float(row.get("count", 0) or 0))
                delta_max = safe_float(row.get("maxRango", 0.0))
                control = "ALERTA" if row.get("hasLargeSpread") else "OK"

                m_value = 0.0

                writer.pointz(x, y, z, m_value)
                writer.record(
                    x,
                    y,
                    z,
                    descriptor,
                    observ,
                    delta_max,
                    control,
                )

            writer.close()

            with open(f"{shp_base}.prj", "w", encoding="utf-8") as f:
                f.write(prj_wkt)

            with open(f"{shp_base}.cpg", "w", encoding="utf-8") as f:
                f.write("UTF-8")

            memory_zip = io.BytesIO()
            with zipfile.ZipFile(memory_zip, "w", zipfile.ZIP_DEFLATED) as zf:
                for ext in (".shp", ".shx", ".dbf", ".prj", ".cpg"):
                    full_path = f"{shp_base}{ext}"
                    if os.path.exists(full_path):
                        zf.write(full_path, arcname=f"{layer_name}{ext}")

            memory_zip.seek(0)

            return send_file(
                memory_zip,
                mimetype="application/zip",
                as_attachment=True,
                download_name=f"{layer_name}.zip",
            )

    except Exception as e:
        return jsonify({"error": str(e)}), 500
