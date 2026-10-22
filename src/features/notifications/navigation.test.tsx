import React from 'react';
import {act,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {beforeEach,describe,expect,it,vi} from 'vitest';
import {AppProvider} from '../../context/AppContext';
import {useAppContext} from '../../context/useAppContext';
import {clearPersistedUiSession} from '../../context/ui-session-storage';
let auth={isAuthRequired:true,isLoading:false,role:'coo',isAuthenticated:true,isRoleSwitching:false,currentUserId:'user-a',currentProfileId:'profile-a'};
vi.mock('../../app/providers/useAuth',()=>({useAuth:()=>auth}));
vi.mock('../../features/timelogs/services/timelogs.service',()=>({getTimelogs:()=>[]}));
vi.mock('../../features/receipts/services/receipts.service',()=>({getReceipts:()=>[],deleteReceipt:vi.fn()}));
function Probe(){const c=useAppContext();return <>
 <p data-testid="tab">{c.currentTab}</p><p data-testid="event">{c.selectedEventId}</p>
 <button onClick={()=>c.setNavigationGuardMessage('Máte rozpracované změny.')}>Rozpracovat</button>
 <button onClick={()=>c.openNotificationTarget?.({tab:'events',eventId:'10000000-0000-4000-8000-000000000003'})}>Otevřít upozornění</button>
 </>;}
const tree=()=> <AppProvider><Probe/></AppProvider>;
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
});
