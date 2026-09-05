import { Client } from "@elastic/elasticsearch";
import { env } from "../config/env";

const client = env.ELASTICSEARCH_DISABLED
  ? null
  : new Client({ node: env.ELASTICSEARCH_NODE });

const INDEX = env.ELASTICSEARCH_INDEX;
let ensuredIndex = false;

async function ensureIndex(): Promise<void> {
  if (!client || ensuredIndex) return;
  const exists = await client.indices.exists({ index: INDEX });
  if (!exists) {
    await client.indices.create({
      index: INDEX,
      mappings: {
        properties: {
          userId: { type: "keyword" },
          senderId: { type: "keyword" },
          toEmail: { type: "keyword" },
          subject: { type: "text" },
          body: { type: "text" },
          status: { type: "keyword" },
          scheduledFor: { type: "date" },
          sentAt: { type: "date" },
        },
      },
    });
  }
  ensuredIndex = true;
}

export interface IndexableEmail {
  id: string;
  userId: string;
  senderId: string;
  toEmail: string;
  subject: string;
  body: string;
  status: string;
  scheduledFor: Date;
  sentAt: Date | null;
}

/** Upserts a single email document. Called on create and on every status
 *  transition so search results reflect send state in near real time. */
export async function indexEmail(email: IndexableEmail): Promise<void> {
  if (!client) return; // ES not configured in this environment — no-op
  try {
    await ensureIndex();
    await client.index({
      index: INDEX,
      id: email.id,
      document: email,
      refresh: "wait_for",
    });
  } catch (err) {
    // Search indexing is a best-effort side-effect; it should never take
    // down the scheduling/send path if Elasticsearch is unreachable.
    console.error("Elasticsearch indexing failed:", err);
  }
}

export interface SearchEmailsParams {
  userId: string;
  query?: string;
  status?: string;
}

export async function searchEmails(params: SearchEmailsParams) {
  if (!client) return { hits: [], total: 0, disabled: true as const };

  await ensureIndex();

  const must: Record<string, unknown>[] = [{ term: { userId: params.userId } }];

  if (params.status) {
    must.push({ term: { status: params.status } });
  }

  if (params.query) {
    must.push({
      multi_match: {
        query: params.query,
        fields: ["subject", "body", "toEmail"],
      },
    });
  }

  const result = await client.search({
    index: INDEX,
    query: { bool: { must } },
    sort: [{ scheduledFor: { order: "desc" } }],
    size: 50,
  });

  return {
    hits: result.hits.hits.map((h) => h._source),
    total:
      typeof result.hits.total === "number"
        ? result.hits.total
        : result.hits.total?.value ?? 0,
    disabled: false as const,
  };
}
