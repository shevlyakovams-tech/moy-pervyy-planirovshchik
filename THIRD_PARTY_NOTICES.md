# Сторонние компоненты

Файл сформирован по фактически зафиксированным прямым зависимостям `package.json` и `package-lock.json`. Он не заменяет полные тексты лицензий, находящиеся в соответствующих пакетах `node_modules`.

| Компонент | Версия | Лицензия | Официальный адрес |
|---|---:|---|---|
| @dnd-kit/core | 6.3.1 | MIT | https://github.com/clauderic/dnd-kit |
| @dnd-kit/sortable | 10.0.0 | MIT | https://github.com/clauderic/dnd-kit |
| @prisma/client | 6.19.3 | Apache-2.0 | https://github.com/prisma/prisma |
| next | 16.3.1 | MIT | https://github.com/vercel/next.js |
| react | 19.2.8 | MIT | https://github.com/facebook/react |
| react-dom | 19.2.8 | MIT | https://github.com/facebook/react |
| recharts | 3.10.1 | MIT | https://github.com/recharts/recharts |
| zod | 4.4.3 | MIT | https://github.com/colinhacks/zod |
| @axe-core/playwright | 4.13.0 | MPL-2.0 | https://github.com/dequelabs/axe-core-npm |
| @playwright/test | 1.62.1 | Apache-2.0 | https://github.com/microsoft/playwright |
| @testing-library/jest-dom | 7.0.1 | MIT | https://github.com/testing-library/jest-dom |
| @testing-library/react | 16.3.2 | MIT | https://github.com/testing-library/react-testing-library |
| @testing-library/user-event | 14.6.4 | MIT | https://github.com/testing-library/user-event |
| @types/node | 24.10.1 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped |
| @types/react | 19.2.7 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped |
| @types/react-dom | 19.2.3 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped |
| electron | 43.4.0 | MIT | https://github.com/electron/electron |
| esbuild | 0.27.2 | MIT | https://github.com/evanw/esbuild |
| eslint | 9.39.2 | MIT | https://github.com/eslint/eslint |
| eslint-config-next | 16.3.1 | MIT | https://github.com/vercel/next.js |
| jsdom | 30.0.1 | MIT | https://github.com/jsdom/jsdom |
| prisma | 6.19.3 | Apache-2.0 | https://github.com/prisma/prisma |
| tsx | 4.23.12 | MIT | https://github.com/privatenumber/tsx |
| typescript | 5.9.3 | Apache-2.0 | https://github.com/microsoft/TypeScript |
| vitest | 4.1.10 | MIT | https://github.com/vitest-dev/vitest |

Проверка выполняется командой `npm run licenses:check`: версия установленного прямого пакета должна совпадать с `package.json`, а лицензия и официальный адрес обязаны присутствовать в метаданных пакета.
