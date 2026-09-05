import { redisConnection } from "../config/redis";

const RESERVATION_SCRIPT = `
local count = tonumber(redis.call("GET", KEYS[1]) or "0")
local now = tonumber(ARGV[1])
local hourlyLimit = tonumber(ARGV[2])
local minDelayMs = tonumber(ARGV[3])

local nextHour =
  (math.floor(now / 3600000) + 1) * 3600000

-- Hourly limit already reached
if count >= hourlyLimit then
  return {0, nextHour - now, 1, count}
end

-- Minimum delay not satisfied
local lastSend =
  tonumber(redis.call("GET", KEYS[2]) or "0")

local nextAllowed =
  lastSend + minDelayMs

if now < nextAllowed then
  return {0, nextAllowed - now, 0, count}
end

-- Reserve one send slot atomically
local newCount =
  redis.call("INCR", KEYS[1])

redis.call(
  "EXPIRE",
  KEYS[1],
  7200
)

redis.call(
  "SET",
  KEYS[2],
  now
)

redis.call(
  "PEXPIRE",
  KEYS[2],
  7200000
)

-- We just reached the limit
local limitReached = 0

if newCount >= hourlyLimit then
  limitReached = 1
end

return {
  1,
  0,
  limitReached,
  newCount
}
`;

export async function reserveSendSlot(
  senderId: string,
  hourlyLimit: number,
  minDelayMs: number
): Promise<{
  allowed: boolean;
  waitMs: number;
  limitReached: boolean;
  count: number;
}> {
  const now = Date.now();

  const hourWindow =
    Math.floor(now / 3600000);

  const countKey =
    `email-rate:${senderId}:${hourWindow}`;

  const lastSendKey =
    `email-last-send:${senderId}`;

  const result = (await redisConnection.eval(
    RESERVATION_SCRIPT,
    2,
    countKey,
    lastSendKey,
    String(now),
    String(hourlyLimit),
    String(minDelayMs)
  )) as [number, number, number, number];

  return {
    allowed: result[0] === 1,
    waitMs: Number(result[1]),
    limitReached: result[2] === 1,
    count: Number(result[3]),
  };
}