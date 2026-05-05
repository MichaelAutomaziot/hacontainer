import { NextRequest, NextResponse } from 'next/server';

const WEBHOOK_URL = 'https://eyaly555.app.n8n.cloud/webhook/stock-notifications';

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json();

    console.log('Sending webhook to:', WEBHOOK_URL);
    console.log('Payload:', JSON.stringify(payload, null, 2));

    const response = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const responseText = await response.text();
    console.log('Webhook response status:', response.status);
    console.log('Webhook response:', responseText);

    return NextResponse.json({
      success: response.ok,
      status: response.status,
      message: response.ok ? 'Webhook sent successfully' : 'Webhook failed',
    });
  } catch (error) {
    console.error('Failed to send webhook:', error);
    return NextResponse.json(
      { error: 'Failed to send webhook', details: String(error) },
      { status: 500 }
    );
  }
}
