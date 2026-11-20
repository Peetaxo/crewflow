import React from 'react';
import {act,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {beforeEach,describe,expect,it,vi} from 'vitest';
import {AppProvider} from '../../context/AppContext';
import {useAppContext} from '../../context/useAppContext';
import {clearPersistedUiSession} from '../../context/ui-session-storage';
import type {Role} from '../../types';
let auth={isAuthRequired:true,isLoading:false,role:'coo',isAuthenticated:true,isRoleSwitching:false,currentUserId:'user-a',currentProfileId:'profile-a'};
const statementId='10000000-0000-4000-8000-000000000004';
vi.mock('../../app/providers/useAuth',()=>({useAuth:()=>auth}));
vi.mock('../../features/timelogs/services/timelogs.service',()=>({getTimelogs:()=>[]}));
vi.mock('../../features/receipts/services/receipts.service',()=>({getReceipts:()=>[],deleteReceipt:vi.fn()}));
function Probe({showStatement=false}:{showStatement?:boolean}){const c=useAppContext();return <>
 <p data-testid="tab">{c.currentTab}</p><p data-testid="event">{c.selectedEventId}</p>
 <button onClick={()=>c.setNavigationGuardMessage('Máte rozpracované změny.')}>Rozpracovat</button>
 <button onClick={()=>c.openNotificationTarget?.({tab:'events',eventId:'10000000-0000-4000-8000-000000000003'})}>Otevřít upozornění</button>
 <button onClick={()=>c.openNotificationTarget?.({tab:c.role==='crew'?'my-invoices':'invoices',billingStatementId:statementId})}>Otevřít podklad</button>
 <button onClick={()=>c.openNotificationTarget?.({tab:'invoices'})}>Otevřít faktury</button>
 <button onClick={()=>c.setCurrentTab('events')}>Otevřít akce</button>
 <article id={`notification-invoice-${statementId}`} tabIndex={-1}>Jiná faktura</article>
 {showStatement&&<details><summary>Historie</summary><article id={`notification-billing-statement-${statementId}`} data-testid="statement" tabIndex={-1}>Cílový podklad</article></details>}
 </>;}
const tree=(showStatement=false)=> <AppProvider><Probe showStatement={showStatement}/></AppProvider>;
beforeEach(()=>{clearPersistedUiSession();localStorage.clear();auth={isAuthRequired:true,isLoading:false,role:'coo',isAuthenticated:true,isRoleSwitching:false,currentUserId:'user-a',currentProfileId:'profile-a'};});
describe('Notification navigation',()=>{
 it('respects the unsaved-changes guard and opens the event only after confirming',async()=>{
  render(tree());fireEvent.click(screen.getByText('Rozpracovat'));fireEvent.click(screen.getByText('Otevřít upozornění'));
  expect(screen.getByTestId('event')).toBeEmptyDOMElement();expect(screen.getByTestId('tab')).not.toHaveTextContent('events');
  fireEvent.click(await screen.findByRole('button',{name:'Odejit bez ulozeni'}));
  await waitFor(()=>expect(screen.getByTestId('event')).toHaveTextContent('10000000-0000-4000-8000-000000000003'));
  expect(screen.getByTestId('tab')).toHaveTextContent('events');
 });
 it('discards an old account target when the user changes before confirmation',async()=>{
  const view=render(tree());fireEvent.click(screen.getByText('Rozpracovat'));fireEvent.click(screen.getByText('Otevřít upozornění'));
  await act(async()=>{auth={...auth,currentUserId:'user-b',currentProfileId:'profile-b'};view.rerender(tree());});
  fireEvent.click(await screen.findByRole('button',{name:'Odejit bez ulozeni'}));
  expect(screen.getByTestId('event')).toBeEmptyDOMElement();
 });
 it.each([['crew','my-invoices'],['crewhead','invoices']] as const)('focuses the exact statement for %s when it loads after confirmation',async(role:Role,tab)=>{
  auth={...auth,role};
  const view=render(tree());
  fireEvent.click(screen.getByText('Rozpracovat'));
  fireEvent.click(screen.getByText('Otevřít podklad'));
  expect(screen.getByTestId('tab')).not.toHaveTextContent(tab);
  fireEvent.click(await screen.findByRole('button',{name:'Odejit bez ulozeni'}));
  expect(screen.getByTestId('tab').textContent).toBe(tab);
  expect(screen.getByText('Jiná faktura')).not.toHaveFocus();
  view.rerender(tree(true));
  const statement=screen.getByTestId('statement');
  await waitFor(()=>expect(statement).toHaveFocus());
  expect(statement.closest('details')).toHaveAttribute('open');
 });
 it.each(['generic notification','tab change','account change'])('drops a waiting statement focus after a %s',async(change)=>{
  const view=render(tree());
  fireEvent.click(screen.getByText('Otevřít podklad'));
  expect(screen.getByTestId('tab').textContent).toBe('invoices');
  if(change==='generic notification') fireEvent.click(screen.getByText('Otevřít faktury'));
  if(change==='tab change') fireEvent.click(screen.getByText('Otevřít akce'));
  if(change==='account change') {
   auth={...auth,currentUserId:'user-b',currentProfileId:'profile-b'};
   view.rerender(tree());
  }
  await act(async()=>view.rerender(tree(true)));
  const statement=screen.getByTestId('statement');
  expect(statement).not.toHaveFocus();
  expect(statement.closest('details')).not.toHaveAttribute('open');
 });
});
