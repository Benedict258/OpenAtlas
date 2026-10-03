// The README quickstart, as a runnable file: OPENATLAS_API_KEY=oa_... node examples/quickstart.mjs
import { OpenAtlas, normalizeText } from "openatlas";

const client = new OpenAtlas({ apiKey: process.env.OPENATLAS_API_KEY });

// Repairs text whose special characters were corrupted on the way in ("zaÉ“e" → "zaɓe").
const question = normalizeText("Ina zan je don yin rajistar katin zaÉ“e?", { language: "ha" });

const response = await client.chat({
  messages: [{ role: "user", content: question }],
  language: "ha",
  user: "your-end-user-id", // required: a stable, opaque ID for your end user (license-cap counting)
});
console.log(question);
console.log(response.content);
console.log(`${response.model}, ${response.attribution}`); // NCAIR1/N-ATLaS, Powered by Awarri
