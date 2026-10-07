export type MaterialEntity = {
  id: string;
  conversation_id: string;
  original_name: string;
  detected_mime: string | null;
  byte_size: number;
  state: string;
  error_code: string | null;
  version: number;
  created_at: Date;
  selected?: boolean;
};
