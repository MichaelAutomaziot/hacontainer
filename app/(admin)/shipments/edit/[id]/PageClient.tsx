'use client';

import { Edit } from '@refinedev/mui';
import { ShipmentForm } from '@/components/shipments/ShipmentForm';
import { hebrewTranslations } from '@/locales/he';

export default function ShipmentEditPage() {
  return (
    <Edit
      saveButtonProps={{ children: hebrewTranslations.actions.save }}
      canDelete
    >
      <ShipmentForm action="edit" />
    </Edit>
  );
}
