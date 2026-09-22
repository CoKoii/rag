import { DocumentStatus } from '../entities/document.entity.js';
import type { ParsedDocument } from '../parse/shared/parsed-tree.js';

export interface DocumentParseResponseDto {
  id: string;
  name: string;
  status: DocumentStatus;
  parsedData: ParsedDocument | null;
}
