import type { AuthStatus, ReceivedEvent, SignatureStatus } from '../../api/types';
import { Badge, type Tone } from '../ui';

const signature: Record<SignatureStatus, { tone: Tone; label: string; title: string }> = {
  VALID: { tone: 'green', label: 'Firmado ✓', title: 'La firma HMAC coincide con uno de los secretos configurados' },
  UNSIGNED: { tone: 'blue', label: 'Sin firma', title: 'la credencial no tiene secreto de webhook' },
  UNVERIFIED: { tone: 'amber', label: 'Firmado · sin verificar', title: 'Llegó firmado, pero el demo no tiene secretos con los que comprobarlo' },
  INVALID: { tone: 'red', label: 'Firma inválida · rechazado 401', title: 'La firma no corresponde a ningún secreto configurado' },
};

const reasonLabel: Record<NonNullable<ReceivedEvent['reason']>, string> = {
  NO_SECRETS: 'sin secretos',
  NO_SIGNATURE: 'sin cabecera de firma',
  STALE: 'fuera de plazo',
  MISMATCH: 'no coincide',
};

export function SignatureBadge({ event }: { event: Pick<ReceivedEvent, 'signatureStatus' | 'reason'> }) {
  const info = signature[event.signatureStatus] ?? { tone: 'neutral' as Tone, label: event.signatureStatus, title: '' };
  const showReason = event.signatureStatus === 'INVALID' && event.reason;
  return (
    <Badge tone={info.tone} title={info.title}>
      {info.label}
      {showReason && ` · ${reasonLabel[event.reason!] ?? event.reason}`}
    </Badge>
  );
}

export function AuthBadge({ status }: { status: AuthStatus }) {
  if (status === 'VALID') return <Badge tone="green" title="El token Bearer coincide con el configurado">Token ✓</Badge>;
  if (status === 'MISSING') return <Badge tone="red" title="No llegó la cabecera Authorization">Token ✗ · rechazado 401</Badge>;
  if (status === 'INVALID') return <Badge tone="red" title="El token Bearer no coincide con el configurado">Token ✗ · rechazado 401</Badge>;
  return null;
}

export function DuplicateBadge({ duplicate }: { duplicate: boolean }) {
  return duplicate ? <Badge tone="neutral" title="Ya se había recibido un evento con el mismo eventId">duplicado</Badge> : null;
}
