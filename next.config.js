/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Card art is loaded from external hosts via plain <img> tags, so the
  // next/image optimizer is intentionally not used. Keeps the app portable.
};

module.exports = nextConfig;
