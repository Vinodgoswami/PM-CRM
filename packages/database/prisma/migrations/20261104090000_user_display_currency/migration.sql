-- D-036: the currency a user views the dashboard in (null = company base currency).
ALTER TABLE "User" ADD COLUMN "displayCurrency" TEXT;
