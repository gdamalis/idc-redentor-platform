import {
  Button,
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Input,
  Textarea,
} from "@idcr/web";
import { useForm } from "react-hook-form";

// form.tsx has no callers in this repo — the live contact form is a Server
// Action with uncontrolled inputs (contact-form/formFields.tsx), not
// react-hook-form. So these cells are composed from the component source rather
// than ported from a usage.
//
// The nest is not optional: `Form` IS react-hook-form's FormProvider, and
// FormLabel/FormControl/FormDescription/FormMessage all call useFormField(),
// which throws unless it finds BOTH a FormField and a FormItem above it. Every
// cell therefore runs useForm() and spreads it into <Form>, then wraps each
// control in FormField → FormItem.

interface ContactValues {
  fullName: string;
  email: string;
  message: string;
}

export const TextField = () => {
  const methods = useForm<ContactValues>({
    defaultValues: { fullName: "Ana Belén Ferrari", email: "", message: "" },
  });

  return (
    <Form {...methods}>
      <form className="space-y-4">
        <FormField
          control={methods.control}
          name="fullName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Nombre y apellido</FormLabel>
              <FormControl>
                <Input placeholder="Tu nombre" {...field} />
              </FormControl>
              <FormDescription>
                Así te vamos a saludar cuando vengas el domingo.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
      </form>
    </Form>
  );
};

// FormMessage renders `error.message` and returns null when there is no error,
// so the destructive state only exists once formState carries one. useForm's
// `errors` option (RHF ≥ 7.48) seeds it declaratively — the same channel the
// library uses for server-side errors — which is what a submit failure would
// look like. FormLabel picks up `text-destructive` from the same error.
export const WithError = () => {
  const methods = useForm<ContactValues>({
    defaultValues: { fullName: "Ana Belén Ferrari", email: "ana@", message: "" },
    errors: {
      email: {
        type: "pattern",
        message: "Ingresá un correo electrónico válido.",
      },
    },
  });

  return (
    <Form {...methods}>
      <form className="space-y-4">
        <FormField
          control={methods.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Correo electrónico</FormLabel>
              <FormControl>
                <Input type="email" placeholder="tu@correo.com" {...field} />
              </FormControl>
              <FormDescription>
                Solo lo usamos para responderte. No lo compartimos con nadie.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
      </form>
    </Form>
  );
};

export const ContactShape = () => {
  const methods = useForm<ContactValues>({
    defaultValues: { fullName: "", email: "", message: "" },
  });

  return (
    <Form {...methods}>
      <form className="space-y-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField
            control={methods.control}
            name="fullName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Nombre y apellido</FormLabel>
                <FormControl>
                  <Input
                    placeholder="Tu nombre"
                    className="bg-background"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={methods.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Correo electrónico</FormLabel>
                <FormControl>
                  <Input
                    type="email"
                    placeholder="tu@correo.com"
                    className="bg-background"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={methods.control}
          name="message"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Tu mensaje</FormLabel>
              <FormControl>
                <Textarea
                  rows={4}
                  placeholder="Contanos en qué podemos ayudarte"
                  className="bg-background resize-none"
                  {...field}
                />
              </FormControl>
              <FormDescription>
                Te respondemos dentro de las próximas 48 horas.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button type="submit" size="lg" className="w-full rounded-full h-12">
          Enviar mensaje
        </Button>
      </form>
    </Form>
  );
};
