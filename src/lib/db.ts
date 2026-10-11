import type { MongoClient } from "mongodb";

// Optional MongoDB Atlas persistence for optimization runs. Set MONGODB_URI to enable.
export const dbEnabled = () => Boolean(process.env.MONGODB_URI);

let clientPromise: Promise<MongoClient> | null = null;

export async function db() {
  if (!dbEnabled()) throw new Error("MONGODB_URI not set");
  if (!clientPromise) {
    clientPromise = import("mongodb")
      .then(({ MongoClient }) => new MongoClient(process.env.MONGODB_URI!, { serverSelectionTimeoutMS: 8000 }).connect())
      .catch((e) => {
        clientPromise = null; // don't cache a failed connection; retry on the next request
        throw e;
      });
  }
  const client = await clientPromise;
  return client.db(process.env.MONGODB_DB ?? "dinodocket");
}
