import { BigQuery } from "@google-cloud/bigquery";

const bigquery = new BigQuery({
  projectId: "sharedproject-490507",
  credentials: JSON.parse(process.env.GCP_KEY)
});

export default async function handler(req, res) {
  try {
    // optional: simple protection
    const origin = req.headers.origin || "";

    if (!origin.includes("vercel.app") && !origin.includes("localhost")) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    const query = `
      SELECT GSTIN, COMPANY, FIRM, DATE, Current_Disp
      FROM \`sharedproject-490507.allunitdispatch.sales_data\`
      LIMIT 50
    `;

    const [rows] = await bigquery.query({ query });

    res.status(200).json(rows);

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
}