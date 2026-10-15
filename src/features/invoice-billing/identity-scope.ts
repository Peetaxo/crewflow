// Auth reset retires callbacks synchronously, before cancellation starts awaiting.
const activations = new Set<{ active: boolean }>();
export function registerBillingActivation(value: { active: boolean }) { activations.add(value); return () => { value.active = false; activations.delete(value); }; }
export function retireBillingDataScope() { for (const value of activations) value.active = false; activations.clear(); }
