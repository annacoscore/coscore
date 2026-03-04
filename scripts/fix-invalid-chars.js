#!/usr/bin/env node
/**
 * Remove caracteres inválidos (], [, etc.) dos nomes e descrições
 * dos produtos diretamente no products.ts usando substituição de texto.
 */
const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../src/data/products.ts');
let content = fs.readFileSync(filePath, 'utf8');

// Contar ocorrências antes
const beforeCount = (content.match(/\\\]|\]/g) || []).length;

// Remover ']' e '[' dentro de strings de nome/descrição/brand
// Estratégia: substituir ']' dentro de valores de string JSON por vazio
// Somente nas linhas de "name", "description", "brand", "tags"
const lines = content.split('\n');
let fixed = 0;

const result = lines.map(line => {
  // Verificar se é uma linha de string value (não array ou objeto)
  const isValueLine = /^\s+"(name|description|brand|mlId)"\s*:\s*"/.test(line)
    || /^\s+"[a-z].*"\s*,?\s*$/.test(line); // linhas de array de strings (tags)
  
  if (isValueLine && (line.includes(']') || line.includes('['))) {
    // Verificar se o ] não é parte da estrutura JSON (fim de array)
    // Só remover se está dentro do valor da string (entre aspas)
    const cleaned = line.replace(/("(?:[^"\\]|\\.)*")/g, (match) => {
      if (match.includes(']') || match.includes('[')) {
        fixed++;
        return match.replace(/\[|\]/g, '');
      }
      return match;
    });
    return cleaned;
  }
  return line;
});

content = result.join('\n');
fs.writeFileSync(filePath, content, 'utf8');
console.log(`Linhas corrigidas: ${fixed}`);
console.log('products.ts salvo.');
