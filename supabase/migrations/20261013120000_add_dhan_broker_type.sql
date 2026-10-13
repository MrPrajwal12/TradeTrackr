-- Allow Dhan as a first-class broker type for API sync
ALTER TABLE brokers DROP CONSTRAINT IF EXISTS brokers_type_check;
ALTER TABLE brokers ADD CONSTRAINT brokers_type_check
  CHECK (type IN (
    'zerodha','upstox','groww','angel','fyers','iifl','sharekhan','5paisa',
    'dhan','manual','other'
  ));
