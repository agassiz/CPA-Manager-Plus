import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/Input';
import { MAX_CREDENTIAL_WEIGHT } from '@/utils/credentialWeight';

interface WeightInputProps {
  value?: number;
  disabled: boolean;
  onChange: (weight: number | undefined) => void;
}

export function WeightInput({ value, disabled, onChange }: WeightInputProps) {
  const { t } = useTranslation();
  return (
    <Input
      label={t('providersPage.form.weight')}
      hint={t('providersPage.form.weightHint')}
      type="number"
      step={1}
      max={MAX_CREDENTIAL_WEIGHT}
      placeholder="1"
      value={value ?? ''}
      onChange={(e) => {
        const raw = e.target.value;
        onChange(raw.trim() === '' ? undefined : Number(raw));
      }}
      disabled={disabled}
    />
  );
}
