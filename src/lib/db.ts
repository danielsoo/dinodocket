import type { MongoClient } from "mongodb";

// Optional MongoDB Atlas persistence for optimization runs. Set MONGODB_URI to enable.
export const dbEnabled = () => Boolean(process.env.MONGODB_URI);

let clientPromise: Promise<MongoClient> | null = null;

export async function db() {
  if (!dbEnabled()) throw new Error("MONGODB_URI not set");
  if (!clientPromise) {
    clientPromise = import("mongodb").then(({ MongoClient }) => new MongoClient(process.env.MONGODB_URI!).connect());
  }
  const client = await clientPromise;
  return client.db(process.env.MONGODB_DB ?? "chief");
}
