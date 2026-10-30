import { Tabs, TabsContent, TabsList, TabsTrigger } from '@salescrm/ui';
import { CompanySettingsForm } from './CompanySettingsForm';
import { ImportPanel } from './ImportPanel';
import { can } from '@salescrm/auth/permissions';
import { useSession } from '../auth/api';

export function SettingsPage() {
  // D-021: the Admin edits the company name and manages users; the CEO also sets currency and runs imports.
  const { data: session } = useSession();
  const company = !!session && can(session.user, 'settings.company');
  const ceo = !!session && can(session.user, 'settings.manage');
  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">Settings</h1>
      <Tabs defaultValue="company">
        <TabsList>
          {company && <TabsTrigger value="company">Company</TabsTrigger>}
          {ceo && <TabsTrigger value="import">Import data</TabsTrigger>}
        </TabsList>
        {company && (
          <TabsContent value="company">
            <CompanySettingsForm />
          </TabsContent>
        )}
        {ceo && (
          <TabsContent value="import">
            <ImportPanel />
          </TabsContent>
        )}
      </Tabs>
    </section>
  );
}
