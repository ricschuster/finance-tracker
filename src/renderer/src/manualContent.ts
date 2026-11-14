/**
 * The in-app manual. Plain data so it is easy to edit: a section has a title and blocks, where a
 * block is a paragraph (string), a list (`{ list }`) or a tip (`{ tip }`). Keep it in step with the
 * app: when behaviour changes, update the matching section.
 */
export type Block = string | { list: string[] } | { tip: string }

export interface ManualSection {
  id: string
  title: string
  blocks: Block[]
}

export const MANUAL: ManualSection[] = [
  {
    id: 'start',
    title: 'Getting started',
    blocks: [
      'This app keeps your finances in one place on your own computer. You add transactions by hand or import them from a file, the app sorts them into categories using rules you control, and reports show where your money goes. Nothing is sent anywhere: your data is a single database file on this machine.',
      'A good first session:',
      {
        list: [
          'Import your history. If you are coming from Monarch, Mint or Wealthsimple, go to Import and choose the export file. The file creates your accounts, so you do not need to add any first.',
          'Otherwise add an account with the + next to Accounts in the sidebar, then import a bank file into it, or add transactions by hand.',
          'Check the Categories tab and tidy it to match how you think about spending.',
          'Create rules for payees that come up again and again, then apply them to your past transactions.',
          'Open Dashboard and Reports to see the result, and set up Budgets for the categories you want to watch.',
          'Turn on automatic backups in Data.',
        ],
      },
    ],
  },
  {
    id: 'concepts',
    title: 'How money is recorded',
    blocks: [
      'Amounts are stored in whole cents. Expenses are negative and income is positive. A credit card balance is negative when you owe money.',
      'A transaction can be split into several lines, each with its own category and amount, for example one shop receipt that covers groceries and household items. Reports count each line separately.',
      'A transfer moves money between two of your accounts. It is stored as a linked pair and is left out of spending and income, so paying a credit card from chequing never counts as spending twice.',
      {
        tip: 'Pending transactions count in balances and reports, the same as cleared ones.',
      },
    ],
  },
  {
    id: 'accounts',
    title: 'Accounts',
    blocks: [
      'Accounts live in the sidebar, grouped by type (chequing, savings, credit card, cash, loan, other). Click one to see only its transactions; click Transactions to see everything.',
      {
        list: [
          'Add an account with the + next to Accounts. Give it a name, a type and an opening balance.',
          'Edit, archive or delete an account from its page. Archiving hides it from the sidebar but keeps its history in reports.',
          'The balance shown is the opening balance plus every transaction. If it does not match your bank, you have a missing or duplicated transaction, or the opening balance is off.',
        ],
      },
      'Imports from Monarch, Mint and Wealthsimple do not carry opening balances. Set them by hand on each new account so the balance matches your bank.',
    ],
  },
  {
    id: 'transactions',
    title: 'Transactions, search and bulk edits',
    blocks: [
      'The Transactions view lists everything, newest first. Add transaction (top right) opens the entry form; click a row to edit it. You can change the date, amount, payee, category, tags, notes and status, or split it.',
      'Type in the search box to find transactions instantly. Every word must appear somewhere in the payee, bank description, notes, tags or category, in any order. Filters narrow it further: account, category, tag, status, date range, expense or income, amount range and uncategorized only. The totals line shows the number of matches and their sum.',
      'Save a search you use often and recall it later from the saved searches menu.',
      'Select several rows to act on them together: set a category, add or remove a tag, change the status or delete. Bulk edits count as your own edits, so rules will not overwrite them afterwards.',
      'When you change the category of a transaction, the app offers to make that a rule for similar transactions. Say yes to open a ready-made draft in the Rules editor.',
      {
        tip: 'To record a transfer, use the transfer form instead of entering two transactions by hand. Deleting one side deletes both.',
      },
    ],
  },
  {
    id: 'import',
    title: 'Importing transactions',
    blocks: [
      'Import accepts CSV files, OFX and QFX files, and exports from Mint, Monarch and Wealthsimple. Nothing is saved until you confirm the preview, and every import can be undone.',
      'Single-account files (CSV, OFX, QFX): choose the account the file belongs to, map the columns (the app recognises RBC, TD and Tangerine presets and remembers mappings you save as profiles), then review the preview.',
      'Multi-account files (Monarch, Mint, Wealthsimple): the file holds several accounts. For each one you choose an existing account or "Create a new account". Categories are matched by name; ones you do not have are created, or you can map them to one of yours.',
      'First-time setup: when moving over from another tool, tick "Setup import: replace my categories with the ones in this file". Your unused stock categories are then removed so the file\'s set takes over. Categories that already have transactions, rules or budgets are always kept. The preview lists what will go.',
      'In the preview each row is marked new, duplicate or possible duplicate. Duplicates are skipped. For possible duplicates you choose to merge into the existing transaction, add anyway or skip. Rows that look like the other half of a transfer can be linked. Card and loan payments are linked by default.',
      'Import history lists every batch. Undo removes what the batch added; if you edited any of those transactions, the app asks before deleting them.',
      'The Import folder option watches a folder (for example your Downloads) and offers new bank files from it.',
      {
        tip: 'Importing the same file twice is safe: matching rows are recognised as duplicates.',
      },
    ],
  },
  {
    id: 'categories',
    title: 'Categories',
    blocks: [
      'Categories are a flat list. Each is an expense, income or transfer category and has a colour and an icon. In the Categories tab you can add, rename, recolour, delete (choosing where its transactions go) and merge two categories into one.',
      'Merging moves transactions, rules, saved searches and budgets across. The old name becomes an alias, so later imports that still use it land in the surviving category.',
      'Uncategorized and Transfer are built in and cannot be renamed or deleted.',
      'A transaction can be hidden from budgets with its exclude flag, which is useful for one-off items you do not want to count against a monthly target.',
    ],
  },
  {
    id: 'rules',
    title: 'Rules',
    blocks: [
      'Rules clean up the payee, set the category and add tags automatically. Each rule has conditions (all must be true) and actions.',
      {
        list: [
          'Conditions: the bank description or payee contains, starts with, equals or matches a pattern; the amount is within a range or is an expense or income; the transaction is in a particular account.',
          'Actions: set the payee, set the category, add tags.',
          'Rules run in order and the first one that matches wins, so put specific rules above general ones. Disable a rule to pause it without deleting it.',
        ],
      },
      'Rules run on every import. To fix your existing history, use the preview to see what would change, then apply. Applying twice changes nothing the second time.',
      'A rule never overwrites something you set by hand. If you correct a payee or category yourself, rules leave that field alone for that transaction.',
      'The Suggest rule button on a transaction builds a draft from your own edit, with reference numbers stripped from the description. Review it and save it; nothing is created silently.',
    ],
  },
  {
    id: 'budgets',
    title: 'Budgets',
    blocks: [
      'A budget is a standing monthly amount for an expense category. Pick a month with the stepper at the top. For each budgeted category you see what you have spent, what is left and a bar that turns amber near the limit and red when you are over.',
      'Spent counts every transaction line in the category for that month, so a refund reduces it. Transfers and transactions flagged to hide from budgets are left out.',
      'Spending in categories without a budget is listed underneath with a Budget button to set one quickly. Unspent money does not roll over to the next month yet.',
    ],
  },
  {
    id: 'reports',
    title: 'Dashboard and reports',
    blocks: [
      "The Dashboard is the home screen: this month's income, spending and net, your biggest categories, budget progress, the last six months and your largest transactions. Customize chooses which sections to show. If transactions need review, a reminder links straight to them.",
      'Reports has a period picker (month, quarter, year or custom range) and an account filter. The reports are spending by category, income vs expenses with your savings rate, a monthly trend, top payees and biggest transactions.',
      'Click any category to jump to the matching transactions for that period.',
      'Transfers are never counted. Whether a line is income or spending depends on its category, so a refund in an expense category reduces spending rather than counting as income.',
    ],
  },
  {
    id: 'data',
    title: 'Backups and your data',
    blocks: [
      'All your data is one database file. The Data tab protects it.',
      {
        list: [
          'Export database saves a complete copy. Restore replaces the current data with a copy you choose; the current data is kept first in a backups folder.',
          'Export transactions to CSV writes one row per transaction line for use in a spreadsheet, optionally for a date range.',
          'Automatic backups: choose a folder, how often (in days) and how many to keep. A backup is made at startup and hourly when one is due. Back up now runs one on demand.',
        ],
      },
      {
        tip: 'Back up before a large import or a restore. Restoring to a different computer is the same: export on one, restore on the other.',
      },
    ],
  },
  {
    id: 'appearance',
    title: 'Appearance',
    blocks: [
      'Use the theme control in the sidebar to switch between light, dark and following your system.',
    ],
  },
  {
    id: 'troubleshooting',
    title: 'Troubleshooting',
    blocks: [
      {
        list: [
          'A balance looks wrong: check the opening balance first, then look for a missing import or a duplicate entry.',
          'An import row is marked duplicate but you think it is new: change it in the preview to add anyway.',
          'Imported the wrong file: open Import history and undo that batch.',
          'A rule is not applying: another rule above it may have matched first, or you edited that field by hand.',
          'A category is missing from a report: transfers are excluded, and the Uncategorized category is classified by the sign of the amount.',
          'Something looks broken after an update: restore your latest automatic backup from the Data tab.',
        ],
      },
    ],
  },
]
