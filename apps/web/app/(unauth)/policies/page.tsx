export default function PoliciesPage() {
  return (
    <div className="container mx-auto max-w-4xl px-4 py-12">
      <h1 className="mb-6 text-3xl font-bold">Community Policies</h1>
      <div className="prose prose-slate dark:prose-invert">
        <section className="mb-8">
          <h2 className="mb-4 text-2xl font-semibold">Code of Conduct</h2>
          <p className="mb-4 text-muted-foreground">
            We are committed to providing a welcoming and inclusive environment for all users.
          </p>
          <ul className="list-disc space-y-2 pl-6">
            <li>Be respectful and kind to all community members</li>
            <li>Do not share harmful, offensive, or inappropriate content</li>
            <li>Respect others&apos; privacy and personal information</li>
            <li>Follow all applicable laws and regulations</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="mb-4 text-2xl font-semibold">Content Guidelines</h2>
          <p className="mb-4 text-muted-foreground">
            All content shared in HotCodeChat should be appropriate and relevant.
          </p>
          <ul className="list-disc space-y-2 pl-6">
            <li>No spam, advertising, or promotional content</li>
            <li>No harassment, bullying, or hate speech</li>
            <li>No sharing of illegal content or activities</li>
            <li>Respect intellectual property rights</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="mb-4 text-2xl font-semibold">Privacy</h2>
          <p className="mb-4 text-muted-foreground">
            Your privacy is important to us. We handle your data according to our privacy policy.
          </p>
          <ul className="list-disc space-y-2 pl-6">
            <li>We do not share your personal information with third parties</li>
            <li>Your messages are encrypted and secure</li>
            <li>You can delete your account and data at any time</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-4 text-2xl font-semibold">Violations</h2>
          <p className="mb-4 text-muted-foreground">
            Violations of these policies may result in warnings, temporary suspension, or permanent
            ban from the platform.
          </p>
        </section>
      </div>
    </div>
  );
}

