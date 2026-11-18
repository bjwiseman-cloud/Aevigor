import { useMemo } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { timeZones } from '@/lib/time';

export function TimeZoneSelect({ value, onChange, id }: { value: string; onChange: (v: string) => void; id?: string }) {
  const zones = useMemo(() => timeZones(value), [value]);
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger id={id}><SelectValue /></SelectTrigger>
      <SelectContent className="max-h-72">
        {zones.map((z) => <SelectItem key={z} value={z}>{z.replace(/_/g, ' ')}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}
