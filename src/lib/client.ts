import type { AppMessage, AppResponse } from '@/src/domain/messages';
import type { AppState } from '@/src/domain/types';

export async function sendMessage(message: AppMessage): Promise<AppResponse> {
  const response = (await browser.runtime.sendMessage(message)) as AppResponse | undefined;
  if (!response) throw new Error('Background service không phản hồi.');
  if (!response.ok) throw new Error(response.error ?? 'Có lỗi xảy ra.');
  return response;
}

export async function getState(): Promise<AppState> {
  const response = await sendMessage({ type: 'GET_STATE' });
  if (!response.state) throw new Error('Không đọc được dữ liệu extension.');
  return response.state;
}
