import { query } from "./db";

/**
 * Sends a push notification to a specific customer using Expo Push API
 */
export async function sendPushNotification(customerId: string, title: string, body: string, data?: any) {
  try {
    // 1. Get all active push tokens for this customer from their sessions
    const sessionRes = await query<{ pushToken: string }>(
      `SELECT DISTINCT "pushToken" FROM "UserSession" 
       WHERE "customerId" = $1 AND "pushToken" IS NOT NULL AND "expiresAt" > NOW()`,
      [customerId]
    );

    const tokens = sessionRes.rows.map((row) => row.pushToken);

    if (tokens.length === 0) {
      console.log(`No active push tokens found for customer ${customerId}`);
      return false;
    }

    // 2. Prepare Expo Push messages
    const messages = tokens.map((token) => ({
      to: token,
      sound: 'default',
      title,
      body,
      data: data || {},
    }));

    // 3. Send to Expo Push API
    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(messages),
    });

    if (!response.ok) {
      console.error('Expo Push API Error:', await response.text());
      return false;
    }

    return true;
  } catch (error) {
    console.error('Failed to send push notification:', error);
    return false;
  }
}
