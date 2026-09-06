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

// =====================================================
// Create Elasticsearch index if it does not exist
// =====================================================

export async function ensureEmailIndex(): Promise<void> {
  const exists =
    await elasticsearchClient.indices.exists({
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

  console.log(
    `Elasticsearch index "${EMAIL_INDEX}" created`
  );
}

// =====================================================
// Index one email
// =====================================================

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

// =====================================================
// Delete one email from Elasticsearch
// =====================================================

export async function deleteEmailFromIndex(
  emailId: string
): Promise<void> {
  try {
    await elasticsearchClient.delete({
      index: EMAIL_INDEX,
      id: emailId,
      refresh: "wait_for",
    });

    console.log(
      `Elasticsearch document ${emailId} deleted`
    );
  } catch (error: unknown) {
    const statusCode =
      typeof error === "object" &&
      error !== null &&
      "statusCode" in error
        ? Number(
            (error as {
              statusCode?: number;
            }).statusCode
          )
        : undefined;

    // A missing Elasticsearch document is harmless.
    if (statusCode === 404) {
      console.log(
        `Elasticsearch document ${emailId} was already absent`
      );

      return;
    }

    throw error;
  }
}

// =====================================================
// Delete multiple emails from Elasticsearch
// =====================================================

export async function deleteEmailsFromIndex(
  emailIds: string[]
): Promise<void> {
  if (emailIds.length === 0) {
    return;
  }

  const operations = emailIds.flatMap(
    (emailId) => [
      {
        delete: {
          _index: EMAIL_INDEX,
          _id: emailId,
        },
      },
    ]
  );

  try {
    const response =
      await elasticsearchClient.bulk({
        refresh: "wait_for",
        operations,
      });

    if (response.errors) {
      console.error(
        "Some Elasticsearch delete operations failed:",

        response.items.filter(
          (item) =>
            item.delete?.error
        )
      );
    }

    console.log(
      `Elasticsearch bulk delete completed for ${emailIds.length} document(s)`
    );
  } catch (error) {
    console.error(
      "Elasticsearch bulk delete failed:",
      error
    );

    throw error;
  }
}

// =====================================================
// Search emails
// =====================================================

export async function searchEmails(
  userId: string,
  query: string
) {
  const response =
    await elasticsearchClient.search<EmailSearchDocument>(
      {
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
      }
    );

  return response.hits.hits
    .map(
      (hit) =>
        hit._source
    )
    .filter(
      (
        email
      ): email is EmailSearchDocument =>
        Boolean(email)
    );
}