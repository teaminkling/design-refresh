/** @type {import("next").NextConfig} */
module.exports = {
  reactStrictMode: true,
  async rewrites() {
    return [
      {
        source: "/security.txt",
        destination: "/.well-known/security.txt",
        permanent: true,
      },
      {
        source: "/themes",
        destination: "/weeks",
        permanent: true,
      },
      {
        source: "/works",
        destination: "/",
        permanent: true,
      },
    ]
  }
}
