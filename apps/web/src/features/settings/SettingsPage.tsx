import { Tabs, TabsContent, TabsList, TabsTrigger } from '@salescrm/ui';
import { CompanySettingsForm } from './CompanySettingsForm';
import { ImportPanel } from './ImportPanel';
import { can } from '@salescrm/auth/permissions';
import { useSession } from '../auth/api';
import { UsersPanel } from './UsersPanel';

export function SettingsPage() {
  // D-018: the CEO comes here to manage Project Managers; company settings and import stay with the Admin.
  const { data: session } = useSession();
  const admin = !!session && can(session.user, 'settings.manage');
  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">Settings</h1>
      <Tabs defaultValue={admin ? 'company' : 'users'}>
        <TabsList>
          {admin && <TabsTrigger value="company">Company</TabsTrigger>}
          <TabsTrigger value="users">Users</TabsTrigger>
          {admin && <TabsTrigger value="import">Import data</TabsTrigger>}
        </TabsList>
        {admin && (
          <TabsContent value="company">
            <CompanySettingsForm />
          </TabsContent>
        )}
        <TabsContent value="users">
          <UsersPanel />
        </TabsContent>
        {admin && (
          <TabsContent value="import">
            <ImportPanel />
          </TabsContent>
        )}
      </Tabs>
    </section>
  );
}
