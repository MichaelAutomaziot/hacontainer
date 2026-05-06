'use client';

import { Create } from '@refinedev/mui';
import { ShipmentForm } from '@/components/shipments/ShipmentForm';
import { hebrewTranslations } from '@/locales/he';

export default function ShipmentCreatePage() {
  return (
    <Create
      title={`${hebrewTranslations.actions.create} ${hebrewTranslations.nav.shipments}`}
      saveButtonProps={{ children: hebrewTranslations.actions.save }}
    >
      <ShipmentForm action="create" />
    </Create>
  );
}
