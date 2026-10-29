import { supabase } from '../supabase/client';

export interface ReferenceAuditFile {
  id: string;
  name: string;
  type: string;
  number: string | null;
  uploadedAt: string;
  uploadedBy: string;
  deleted: boolean;
  deletedAt: string | null;
}
export interface ReferenceAuditEvent {
  id: string;
  fileId: string;
  action: string;
  at: string;
  by: string;
  name: string;
  previousName: string | null;
  nextName: string | null;
  previousType: string | null;
  nextType: string | null;
  previousStatus?: string | null;
  nextStatus?: string | null;
  previousPaymentId?: string | null;
  nextPaymentId?: string | null;
  fileChanged: boolean;
}
export interface ReferenceAudit {
  code: string;
  kind: 'OBR' | 'CMP';
  createdAt: string;
  createdBy: string;
  creatorBasis: string;
  location: string | null;
  status: string;
  files: ReferenceAuditFile[];
  events: ReferenceAuditEvent[];
}

/** Performs a single, capability-checked server-side lookup. No writes or file URLs. */
export async function lookupReferenceAudit(code: string): Promise<ReferenceAudit | null> {
  const { data, error } = await supabase.rpc(
    'admin_reference_audit_v1' as never,
    { p_code: code } as never,
  );
  if (error) throw new Error(error.message);
  return data as ReferenceAudit | null;
}
