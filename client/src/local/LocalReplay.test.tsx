import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { axe } from '../test/axe';
import { emptyWorkspace } from './replay';
import { LocalReplay } from './LocalReplay';
const store = vi.hoisted(() => ({ loadWorkspaceSnapshot: vi.fn(), saveWorkspace: vi.fn() }));
const runner = vi.hoisted(() => ({ importLog: vi.fn(), runReplay: vi.fn() }));
vi.mock('./workspace', () => store); vi.mock('./runReplay', () => runner);
describe('local cache replay', () => {
 beforeEach(() => { vi.clearAllMocks(); store.loadWorkspaceSnapshot.mockResolvedValue({data:emptyWorkspace(),revision:0}); store.saveWorkspace.mockResolvedValue(1); runner.runReplay.mockResolvedValue({rows:[],recommendation:null}); });
 it('has accessible workspace and file dialog', async () => {
  render(<LocalReplay />); const button=screen.getByRole('button',{name:'Import file'}); await waitFor(()=>expect(button).toBeEnabled());
  expect(await axe(document.body)).toHaveNoViolations(); fireEvent.click(button); expect(screen.getByLabelText('File format')).toHaveFocus(); expect(await axe(document.body)).toHaveNoViolations();
  fireEvent.click(screen.getByRole('button',{name:'Review import'})); expect(screen.getByRole('alert')).toHaveTextContent('Choose a file'); fireEvent.keyDown(document,{key:'Escape'}); expect(button).toHaveFocus();
 });
 it('keeps busy import focus contained and preserves saved data on invalid files', async () => {
  let reject!: (error:Error)=>void; runner.importLog.mockImplementationOnce(()=>new Promise((_,fail)=>{reject=fail;}));
  render(<LocalReplay />); const opener=screen.getByRole('button',{name:'Import file'}); await waitFor(()=>expect(opener).toBeEnabled()); fireEvent.click(opener);
  fireEvent.change(screen.getByLabelText('Choose file'),{target:{files:[new File(['invalid'],'bad.csv')]}}); fireEvent.click(screen.getByRole('button',{name:'Review import'}));
  fireEvent.keyDown(document,{key:'Tab'}); expect(screen.getByRole('dialog')).toHaveFocus(); fireEvent.keyDown(document,{key:'Escape'}); expect(screen.getByRole('dialog')).toBeInTheDocument();
  await act(async()=>reject(new Error('bad.csv: missing key column'))); fireEvent.keyDown(document,{key:'Tab',shiftKey:true}); expect(screen.getByRole('button',{name:'Cancel'})).toHaveFocus(); expect(store.saveWorkspace).not.toHaveBeenCalled();
 });
 it('does not replace visible data when another tab changed the workspace', async () => {
  store.saveWorkspace.mockRejectedValueOnce(new Error('Workspace changed in another tab. Reload before making more changes.'));
  render(<LocalReplay />); const button=screen.getByRole('button',{name:'Save and replay'}); await waitFor(()=>expect(button).toBeEnabled());
  fireEvent.change(screen.getByLabelText('Capacities, in keys'),{target:{value:'1,2'}}); fireEvent.click(button); await screen.findByRole('alert'); expect(screen.getByRole('alert')).toHaveTextContent('another tab'); expect(store.saveWorkspace).toHaveBeenCalledWith(expect.anything(),{expectedRevision:0});
 });
});

it('previews replacement counts and saves only after explicit confirmation', async () => {
 store.loadWorkspaceSnapshot.mockResolvedValue({data:emptyWorkspace(),revision:0});
 store.saveWorkspace.mockResolvedValue(1); runner.importLog.mockResolvedValue([{key:'synthetic',timeMs:0}]);
 runner.runReplay.mockResolvedValue({rows:[],recommendation:null}); store.saveWorkspace.mockClear();
 render(<LocalReplay />); const opener=screen.getByRole('button',{name:'Import file'}); await waitFor(()=>expect(opener).toBeEnabled()); fireEvent.click(opener);
 fireEvent.change(screen.getByLabelText('Choose file'),{target:{files:[new File(['key\nsynthetic'],'log.csv')]}}); fireEvent.click(screen.getByRole('button',{name:'Review import'}));
 const confirm=await screen.findByRole('button',{name:'Replace saved workspace'}); expect(screen.getByText(/Replace 0 saved accesses with 1 imported accesses/)).toBeInTheDocument(); expect(store.saveWorkspace).not.toHaveBeenCalled(); expect(confirm).toHaveFocus();
 fireEvent.click(confirm); await waitFor(()=>expect(store.saveWorkspace).toHaveBeenCalled()); await waitFor(()=>expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
});
