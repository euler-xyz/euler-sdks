export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return

  const { startVaultsSnapshotCronJobs } = await import("./app/server/vaultsData")
  startVaultsSnapshotCronJobs()
}
