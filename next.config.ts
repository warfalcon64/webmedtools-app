import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Static export: `next build` writes plain HTML to out/, and no server runs. Removing this line is the step to
  // server features (ADR 0004).
  output: "export",
};

export default nextConfig;
