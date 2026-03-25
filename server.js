const express = require("express");
const cors = require("cors");
const { BigQuery } = require("@google-cloud/bigquery");
const path = require("path");

console.log("SERVER VERSION: MONTHLY MT REPORT V1");

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

const bigquery = new BigQuery({
  projectId: "sharedproject-490507"
});

function escapeSql(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

app.get("/api/products", async (req, res) => {
  try {
    const year = parseInt(req.query.year, 10) || 2026;

    const query = `
      SELECT DISTINCT
        NULLIF(FIRM, '') AS FIRM_NAME
      FROM \`sharedproject-490507.allunitdispatch.sales_data\`
      WHERE SAFE.PARSE_DATE('%Y-%m-%d', DATE) IS NOT NULL
        AND EXTRACT(YEAR FROM SAFE.PARSE_DATE('%Y-%m-%d', DATE)) = ${year}
        AND NULLIF(FIRM, '') IS NOT NULL
      ORDER BY FIRM_NAME
    `;

    const [rows] = await bigquery.query({
      query,
      location: "asia-south1"
    });

    res.setHeader("Cache-Control", "no-store");
    res.json(rows.map(r => r.FIRM_NAME).filter(Boolean));
  } catch (err) {
    console.error("Products/Firm error:", err);
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/data", async (req, res) => {
  try {
    res.setHeader("Cache-Control", "no-store");

    const page = parseInt(req.query.page, 10) || 1;
    const limit = 100;
    const offset = (page - 1) * limit;

    const year = parseInt(req.query.year, 10) || 2026;
    const search = (req.query.search || "").trim();
    const firm = (req.query.product || "").trim();

    let where = `
      WHERE SAFE.PARSE_DATE('%Y-%m-%d', DATE) IS NOT NULL
        AND EXTRACT(YEAR FROM SAFE.PARSE_DATE('%Y-%m-%d', DATE)) = ${year}
    `;

    if (firm) {
      const f = escapeSql(firm.toLowerCase());
      where += `
        AND LOWER(IFNULL(FIRM, '')) LIKE '%${f}%'
      `;
    }

    if (search) {
      const s = escapeSql(search.toLowerCase());
      where += `
        AND (
          LOWER(IFNULL(DIST, '')) LIKE '%${s}%'
          OR LOWER(IFNULL(TALUKA, '')) LIKE '%${s}%'
          OR LOWER(IFNULL(AREA, '')) LIKE '%${s}%'
          OR LOWER(IFNULL(FIRM, '')) LIKE '%${s}%'
          OR LOWER(IFNULL(NEW_COMPANY, '')) LIKE '%${s}%'
          OR LOWER(IFNULL(COMPANY, '')) LIKE '%${s}%'
        )
      `;
    }

    const baseCte = `
      WITH base AS (
        SELECT
          IFNULL(DIST, '') AS DISTRICT,
          IFNULL(TALUKA, '') AS TALUKA,
          IFNULL(AREA, '') AS AREA,
          IFNULL(FIRM, '') AS FIRM,
          COALESCE(NULLIF(NEW_COMPANY, ''), NULLIF(COMPANY, ''), '') AS PLANT_PRODUCT,
          EXTRACT(MONTH FROM SAFE.PARSE_DATE('%Y-%m-%d', DATE)) AS MONTH_NO,
          SAFE_CAST(Current_Dispt_Qty AS FLOAT64) / 1000 AS QTY_MT
        FROM \`sharedproject-490507.allunitdispatch.sales_data\`
        ${where}
      )
    `;

    const dataQuery = `
      ${baseCte}
      SELECT
        DISTRICT,
        TALUKA,
        AREA,
        FIRM,
        PLANT_PRODUCT,
        ROUND(SUM(CASE WHEN MONTH_NO = 1  THEN IFNULL(QTY_MT, 0) ELSE 0 END), 3) AS JAN,
        ROUND(SUM(CASE WHEN MONTH_NO = 2  THEN IFNULL(QTY_MT, 0) ELSE 0 END), 3) AS FEB,
        ROUND(SUM(CASE WHEN MONTH_NO = 3  THEN IFNULL(QTY_MT, 0) ELSE 0 END), 3) AS MAR,
        ROUND(SUM(CASE WHEN MONTH_NO = 4  THEN IFNULL(QTY_MT, 0) ELSE 0 END), 3) AS APR,
        ROUND(SUM(CASE WHEN MONTH_NO = 5  THEN IFNULL(QTY_MT, 0) ELSE 0 END), 3) AS MAY,
        ROUND(SUM(CASE WHEN MONTH_NO = 6  THEN IFNULL(QTY_MT, 0) ELSE 0 END), 3) AS JUN,
        ROUND(SUM(CASE WHEN MONTH_NO = 7  THEN IFNULL(QTY_MT, 0) ELSE 0 END), 3) AS JUL,
        ROUND(SUM(CASE WHEN MONTH_NO = 8  THEN IFNULL(QTY_MT, 0) ELSE 0 END), 3) AS AUG,
        ROUND(SUM(CASE WHEN MONTH_NO = 9  THEN IFNULL(QTY_MT, 0) ELSE 0 END), 3) AS SEP,
        ROUND(SUM(CASE WHEN MONTH_NO = 10 THEN IFNULL(QTY_MT, 0) ELSE 0 END), 3) AS OCT,
        ROUND(SUM(CASE WHEN MONTH_NO = 11 THEN IFNULL(QTY_MT, 0) ELSE 0 END), 3) AS NOV,
        ROUND(SUM(CASE WHEN MONTH_NO = 12 THEN IFNULL(QTY_MT, 0) ELSE 0 END), 3) AS DEC
      FROM base
      GROUP BY DISTRICT, TALUKA, AREA, FIRM, PLANT_PRODUCT
      ORDER BY DISTRICT, TALUKA, AREA, FIRM, PLANT_PRODUCT
      LIMIT ${limit} OFFSET ${offset}
    `;

    const countQuery = `
      ${baseCte}
      SELECT COUNT(*) AS total_count
      FROM (
        SELECT
          DISTRICT,
          TALUKA,
          AREA,
          FIRM,
          PLANT_PRODUCT
        FROM base
        GROUP BY DISTRICT, TALUKA, AREA, FIRM, PLANT_PRODUCT
      )
    `;

    const [rows] = await bigquery.query({
      query: dataQuery,
      location: "asia-south1"
    });

    const [countRows] = await bigquery.query({
      query: countQuery,
      location: "asia-south1"
    });

    const totalRows = Number(countRows[0]?.total_count || 0);
    const totalPages = Math.max(1, Math.ceil(totalRows / limit));

    res.json({
      page,
      limit,
      totalRows,
      totalPages,
      rows
    });
  } catch (err) {
    console.error("BigQuery error:", err);
    res.status(500).json({ error: err.message });
  }
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});