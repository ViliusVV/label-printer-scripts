export default function PrintPage() {
  return (
    <div class="flex h-[calc(100vh-3rem)] w-full flex-col">
      <iframe
        src="/streamlit/"
        title="Label printer UI"
        class="h-full w-full flex-1 border-0"
        allow="serial; clipboard-read; clipboard-write"
      />
    </div>
  );
}
