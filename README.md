## A Vite plugin that tries to keep the hash of a single file unchanged

When we update our program, if we only change one file, such as modifying the About file, it will still affect the cache hit of the entry file. This is because the hash change of the file affects other files, causing the content of other files to change, and their hashes to change. The change of hash spreads like a virus, affecting all files that depend on it, including the entry file.

So the role of this plugin is that when you modify one file, it will never affect other files.

```typescript
import { 
  defineConfig, 
} from 'vite'
import react from '@vitejs/plugin-react-swc'

import staticFilehashPlugin from 'vite-plugin-static-filehash';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(), 
    staticFilehashPlugin(),
  ],
})

```


The effect of not using this plugin:
![image](https://github.com/user-attachments/assets/6a1e110c-9cf9-4624-9857-13d46eeedc4b)
![image](https://github.com/user-attachments/assets/529d9852-0940-4f26-8ee2-57e80c9b2dfd)
![image](https://github.com/user-attachments/assets/027adaec-8ff0-4fac-a254-72409475c7e6)

The effect of using this plugin:
![image](https://github.com/user-attachments/assets/f9581e43-2fcf-4c27-aa0b-ae72048f11d4)
![image](https://github.com/user-attachments/assets/f224b714-7c99-47f6-a159-94d237c682fc)
![image](https://github.com/user-attachments/assets/bd6418f2-8de3-4238-84b0-383a884f18c4)
![image](https://github.com/user-attachments/assets/ab78feee-871e-4be1-a509-1ebca304740b)
