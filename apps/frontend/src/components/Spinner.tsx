import { Loader2 } from 'lucide-react';

interface Props {
  size?: number;
  className?: string;
}

export default function Spinner({ size = 14, className = '' }: Props) {
  return <Loader2 size={size} className={`animate-spin ${className}`} />;
}
