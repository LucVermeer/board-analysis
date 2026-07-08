import { type SaveAttemptOptions, type AuroraBoardName, WEB_HOSTS } from './types';
import { generateUuid } from './util';

export async function saveAttempt(
  board: AuroraBoardName,
  token: string,
  options: SaveAttemptOptions,
): Promise<unknown> {
  const uuid = generateUuid();

  // Aurora's wire format "YYYY-MM-DD HH:mm:ss" is UTC. Derive it from the UTC
  // ISO instant — the old dayjs().format() rendered the server's LOCAL wall
  // time, so a non-UTC deployment posted every attempt shifted by its offset.
  const formattedDate = new Date(options.climbed_at).toISOString().slice(0, 19).replace('T', ' ');

  // Match the Kotlin implementation structure
  const requestData = {
    uuid,
    user_id: options.user_id,
    climb_uuid: options.climb_uuid,
    angle: options.angle,
    is_mirror: options.is_mirror ? 1 : 0,
    bid_count: options.bid_count,
    comment: options.comment,
    climbed_at: formattedDate,
  };

  // Build URL-encoded form data
  const requestBody = new URLSearchParams();
  Object.entries(requestData).forEach(([key, value]) => {
    requestBody.append(key, String(value));
  });

  // Use the web host endpoint with POST method
  const url = `${WEB_HOSTS[board]}/bids/save`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'Kilter Board/202 CFNetwork/1568.100.1 Darwin/24.0.0',
      Cookie: `token=${token}`,
    },
    body: requestBody.toString(),
  });

  if (!response.ok) {
    const responseClone = response.clone();
    let errorData;
    try {
      errorData = await response.json();
    } catch {
      try {
        errorData = await responseClone.text();
      } catch {
        errorData = 'Could not read error response';
      }
    }
    console.error('Error response:', {
      status: response.status,
      statusText: response.statusText,
      errors: errorData,
    });
    throw new Error(`HTTP error! status: ${response.status}, details: ${JSON.stringify(errorData)}`);
  }

  // Handle response
  let responseData: unknown;
  try {
    const responseText = await response.text();

    if (!responseText || responseText.trim() === '') {
      throw new Error('Empty response from API');
    }
    responseData = JSON.parse(responseText);
  } catch (parseError) {
    console.error('Failed to parse response:', parseError);
    throw new Error(`Failed to parse API response: ${String(parseError)}`);
  }

  return responseData;
}
