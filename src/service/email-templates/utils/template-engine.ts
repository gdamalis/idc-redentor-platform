import fs from 'fs';
import path from 'path';

/**
 * Reads an HTML template file and replaces placeholders with actual values
 * 
 * @param templateName Name of the template file without extension
 * @param variables Object containing key-value pairs to replace in the template
 * @returns Processed HTML content with variables replaced
 */
export function renderTemplate(templateName: string, variables: Record<string, string>): string {
  try {
    const templatePath = path.resolve(process.cwd(), 'src/service/email-templates/html', `${templateName}.html`);
    
    let templateContent = fs.readFileSync(templatePath, 'utf8');
    
    if (!variables.currentYear) {
      variables.currentYear = new Date().getFullYear().toString();
    }
    
    if (!variables.baseUrl) {
      variables.baseUrl = process.env.NEXT_PUBLIC_BASE_URL;
    }
    
    Object.entries(variables).forEach(([key, value]) => {
      const regex = new RegExp(`{{${key}}}`, 'g');
      templateContent = templateContent.replace(regex, value);
    });
    
    return templateContent;
  } catch (error) {
    console.error(`Error rendering template ${templateName}:`, error);
    throw new Error(`Failed to render email template: ${templateName}`);
  }
} 