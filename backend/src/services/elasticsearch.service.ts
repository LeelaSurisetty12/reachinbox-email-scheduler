import {
  elasticsearchClient,
  EMAIL_INDEX,
} from "../config/elasticsearch";

export interface EmailSearchDocument {
  id: string;
  userId: string;
  senderId: string;
  recipient: string;
  subject: string;
  body: string;
  status: string;
  scheduledAt: string;
  sentAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export async function ensureEmailIndex(): Promise<void> {
  const exists = await elasticsearchClient.indices.exists({
    index: EMAIL_INDEX,
  });

  if (exists) {
    return;
  }

  await elasticsearchClient.indices.create({
    index: EMAIL_INDEX,
    mappings: {
      properties: {
        id: {
          type: "keyword",
        },
        userId: {
          type: "keyword",
        },
        senderId: {
          type: "keyword",
        },
        recipient: {
          type: "text",
          fields: {
            keyword: {
              type: "keyword",
            },
          },
        },
        subject: {
          type: "text",
        },
        body: {
          type: "text",
        },
        status: {
          type: "keyword",
        },
        scheduledAt: {
          type: "date",
        },
        sentAt: {
          type: "date",
        },
        createdAt: {
          type: "date",
        },
        updatedAt: {
          type: "date",
        },
      },
    },
  });

  console.log(`Elasticsearch index "${EMAIL_INDEX}" created`);
}

export async function indexEmail(
  email: EmailSearchDocument
): Promise<void> {
  await elasticsearchClient.index({
    index: EMAIL_INDEX,
    id: email.id,
    document: email,
    refresh: "wait_for",
  });
}

export async function searchEmails(
  userId: string,
  query: string
) {
  const response =
    await elasticsearchClient.search<EmailSearchDocument>({
      index: EMAIL_INDEX,
      query: {
        bool: {
          must: [
            {
              multi_match: {
                query,
                fields: [
                  "recipient",
                  "subject",
                  "body",
                ],
              },
            },
          ],
          filter: [
            {
              term: {
                userId,
              },
            },
          ],
        },
      },
      sort: [
        {
          createdAt: {
            order: "desc",
          },
        },
      ],
    });

  return response.hits.hits.map((hit) => hit._source);
}