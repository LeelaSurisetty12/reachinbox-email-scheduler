import { prisma } from "../config/prisma";
import { redisConnection } from "../config/redis";

interface SlackOAuthResponse {
  ok: boolean;
  access_token?: string;

  team?: {
    id: string;
    name: string;
  };

  incoming_webhook?: {
    url: string;
    channel: string;
    channel_id: string;
  };

  error?: string;
}

export function getSlackAuthorizeUrl(
  state: string
): string {
  const clientId = process.env.SLACK_CLIENT_ID;
  const redirectUri = process.env.SLACK_REDIRECT_URI;

  if (!clientId) {
    throw new Error(
      "SLACK_CLIENT_ID is not configured"
    );
  }

  if (!redirectUri) {
    throw new Error(
      "SLACK_REDIRECT_URI is not configured"
    );
  }

  const params = new URLSearchParams({
    client_id: clientId,
    scope: "incoming-webhook",
    redirect_uri: redirectUri,
    state,
  });

  return `https://slack.com/oauth/v2/authorize?${params.toString()}`;
}

export async function exchangeSlackCode(
  code: string
): Promise<SlackOAuthResponse> {
  const clientId = process.env.SLACK_CLIENT_ID;
  const clientSecret =
    process.env.SLACK_CLIENT_SECRET;
  const redirectUri =
    process.env.SLACK_REDIRECT_URI;

  if (
    !clientId ||
    !clientSecret ||
    !redirectUri
  ) {
    throw new Error(
      "Slack OAuth environment variables are missing"
    );
  }

  const credentials = Buffer.from(
    `${clientId}:${clientSecret}`
  ).toString("base64");

  const response = await fetch(
    "https://slack.com/api/oauth.v2.access",
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type":
          "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        code,
        redirect_uri: redirectUri,
      }),
    }
  );

  const data =
    (await response.json()) as SlackOAuthResponse;

  if (!data.ok) {
    throw new Error(
      `Slack OAuth failed: ${
        data.error ?? "unknown_error"
      }`
    );
  }

  return data;
}

export async function saveSlackConnection(
  userId: string,
  data: SlackOAuthResponse
): Promise<void> {
  if (!data.incoming_webhook?.url) {
    throw new Error(
      "Slack did not return an incoming webhook"
    );
  }

  await prisma.slackConnection.upsert({
    where: {
      userId,
    },

    create: {
      userId,

      accessToken:
        data.access_token ?? null,

      webhookUrl:
        data.incoming_webhook.url,

      channelId:
        data.incoming_webhook.channel_id,

      channelName:
        data.incoming_webhook.channel,

      teamId:
        data.team?.id,

      teamName:
        data.team?.name,
    },

    update: {
      accessToken:
        data.access_token ?? null,

      webhookUrl:
        data.incoming_webhook.url,

      channelId:
        data.incoming_webhook.channel_id,

      channelName:
        data.incoming_webhook.channel,

      teamId:
        data.team?.id,

      teamName:
        data.team?.name,
    },
  });
}

export async function sendSlackMessage(
  userId: string,
  message: string
): Promise<void> {
  const connection =
    await prisma.slackConnection.findUnique({
      where: {
        userId,
      },
    });

  // Slack is optional.
  // If it is not connected, do nothing.
  if (!connection) {
    console.log(
      `Slack not connected for user ${userId}`
    );

    return;
  }

  const response = await fetch(
    connection.webhookUrl,
    {
      method: "POST",

      headers: {
        "Content-Type": "application/json",
      },

      body: JSON.stringify({
        text: message,
      }),
    }
  );

  const responseText =
    await response.text();

  if (!response.ok) {
    throw new Error(
      `Slack webhook failed: ${response.status} ${responseText}`
    );
  }
}

export async function disconnectSlack(
  userId: string
): Promise<void> {
  await prisma.slackConnection.deleteMany({
    where: {
      userId,
    },
  });
}

export async function getSlackStatus(
  userId: string
) {
  const connection =
    await prisma.slackConnection.findUnique({
      where: {
        userId,
      },

      select: {
        channelId: true,
        channelName: true,
        teamId: true,
        teamName: true,
        createdAt: true,
      },
    });

  return {
    connected: Boolean(connection),
    connection,
  };
}
export async function notifyRateLimitReached(
  userId: string,
  senderEmail: string,
  hourlyLimit: number,
  count: number
): Promise<void> {
  const now = new Date();

  const hourWindow =
    Math.floor(now.getTime() / 3600000);

  // Prevent duplicate notifications from multiple workers
  const notificationKey =
    `slack-rate-limit-notified:${userId}:${senderEmail}:${hourWindow}`;

  const acquired =
    await redisConnection.set(
      notificationKey,
      "1",
      "EX",
      7200,
      "NX"
    );

  // Another worker already notified Slack
  if (acquired !== "OK") {
    return;
  }

  const connection =
    await prisma.slackConnection.findUnique({
      where: {
        userId,
      },
    });

  // Slack is optional
  if (!connection) {
    console.log(
      `Slack not connected for user ${userId}`
    );

    return;
  }

  const nextHour = new Date(
    (hourWindow + 1) * 3600000
  );

  const message = [
    "⚠️ *Email hourly rate limit reached*",
    "",
    `*Sender:* ${senderEmail}`,
    `*Hourly limit:* ${hourlyLimit}`,
    `*Emails reserved this hour:* ${count}`,
    `*Next available window:* ${nextHour.toLocaleString()}`,
  ].join("\n");

  const response = await fetch(
    connection.webhookUrl,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text: message,
      }),
    }
  );

  const responseText =
    await response.text();

  if (!response.ok) {
    throw new Error(
      `Slack notification failed: ${response.status} ${responseText}`
    );
  }

  console.log(
    `Slack rate-limit notification sent for ${senderEmail}`
  );
}