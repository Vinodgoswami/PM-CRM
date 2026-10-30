import { Tabs, TabsContent, TabsList, TabsTrigger } from '@salescrm/ui';
import { CompanySettingsForm } from './CompanySettingsForm';
import { ImportPanel } from './ImportPanel';
import { UsersPanel } from './UsersPanel';

export function SettingsPage() {
  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">Settings</h1>
      <Tabs defaultValue="company">
        <TabsList>
          <TabsTrigger value="company">Company</TabsTrigger>
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="import">Import data</TabsTrigger>
        </TabsList>
        <TabsContent value="company">
          <CompanySettingsForm />
        </TabsContent>
        <TabsContent value="users">
          <UsersPanel />
        </TabsContent>
        <TabsContent value="import">
          <ImportPanel />
        </TabsContent>
      </Tabs>
    </section>
  );
}
