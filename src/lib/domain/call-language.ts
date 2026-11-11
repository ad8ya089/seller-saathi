import type { Language } from '@/lib/voice/language';
import type { SellerData } from '@/lib/domain/data-schemas';
import type { QuestionId, SellerActionId } from '@/lib/domain/types';
import { QUESTION_BANK } from '@/lib/domain/questions';
import { ACTION_POLICY } from '@/lib/domain/action-context';
import { spokenNumber } from '@/lib/domain/spoken-numbers';

export const HINDI_ACTION_TITLES: Readonly<Record<SellerActionId, string>> = {
  A_RESTOCK_TOP:
    'Top sellers ko pehle restock kijiye, chhota batch bhi chalega',
  A_STOCK_SYNC:
    'Panel stock ko physical stock se match kijiye, jo ship nahi ho sakta use zero rakhiye',
  A_PUSH_INSTOCK:
    'In-stock bestsellers ka buffer rakhiye aur photos aur titles check kijiye',
  A_DISPATCH_SLA: 'Packing aur courier handover ka routine theek kijiye',
  A_VISIBILITY_AUDIT:
    'Restock ke baad product views dekhiye aur top sellers ke title aur image check kijiye',
  A_PRICE_CHECK: `Price badalne se pehle top sellers ke ${spokenNumber(ACTION_POLICY.priceComparisons)} competitor prices compare kijiye`,
};
const HI_QUESTIONS: Readonly<
  Record<Exclude<QuestionId, 'Q_OOS_CONFIRM'>, string>
> = {
  Q_RESTOCK_ETA: 'Fresh stock kitne din mein aane ki ummeed hai?',
  Q_DISPATCH:
    'Kya orders time par pack hokar courier ko handover ho rahe hain?',
  Q_VIEWS:
    'Kya seller panel mein product views pichhle mahine se kam hue hain?',
  Q_UNDERCUT:
    'Kya doosre sellers ne aise products ke prices haal mein kam kiye hain?',
  Q_CAPACITY: 'Kya is hafte chhota restock batch bhi possible hai?',
};
export function questionText(
  id: QuestionId,
  language: Language,
  data?: SellerData,
): string {
  if (language === 'en-IN') return QUESTION_BANK[id].text;
  if (id !== 'Q_OOS_CONFIRM') return HI_QUESTIONS[id];
  const names =
    data?.skus.skus
      .filter((sku) => sku.stock === 0)
      .sort((a, b) => b.ordersLast - a.ordersLast)
      .slice(0, 2)
      .map((sku) => sku.spokenName)
      .join(' aur ') || 'Priority products';
  return `${names} out of stock hain. Kya ye aapke regular bestsellers hain?`;
}
export function callCopy(language: Language): {
  saveQuestion: string;
  savedReceipt: string;
  intakeQuestion: string;
  intakeFallback: string;
  findingsFallback: string;
  investigateFallback: string;
} {
  return language === 'hi-IN'
    ? {
        saveQuestion: 'Kya main yeh plan save kar doon?',
        savedReceipt: 'Demo ledger mein save ho gaya.',
        intakeQuestion: 'Sales ki kis dikkat mein main madad karoon?',
        intakeFallback:
          'Main available demo data se sales review karne mein madad kar sakta hoon.',
        findingsFallback: 'Maine available seller data check kiya hai.',
        investigateFallback:
          'Samajh gaya, agle zaroori step par dhyan dete hain.',
      }
    : {
        saveQuestion: 'Shall I save this plan?',
        savedReceipt: 'Saved to the demo ledger.',
        intakeQuestion: 'What sales problem can I help with?',
        intakeFallback:
          'I can help review sales using the available demo data.',
        findingsFallback: 'I have checked the available seller data.',
        investigateFallback:
          'Understood, let us focus on the most useful next step.',
      };
}
