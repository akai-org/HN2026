// Granica błędów: nietypowy JSON (np. z modelu językowego) nie może wywrócić całej strony.
// Pokazujemy komunikat w miejscu zepsutego fragmentu, a reszta ekranu działa dalej.
import { Component } from "react";
import { TriangleAlert } from "lucide-react";

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null, resetKey: props.resetKey };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  static getDerivedStateFromProps(props, state) {
    // Nowa treść (np. poprawiony JSON) = nowa próba narysowania fragmentu.
    if (props.resetKey !== state.resetKey) return { error: null, resetKey: props.resetKey };
    return null;
  }

  componentDidCatch(error, info) {
    console.error("Błąd w fragmencie konwertera:", error, info?.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div role="alert" className="m-4 flex items-start gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
        <TriangleAlert aria-hidden="true" size={20} className="mt-0.5 shrink-0 text-amber-700" />
        <div>
          <p className="font-semibold">{this.props.title ?? "Nie udało się wyświetlić tego fragmentu."}</p>
          <p className="mt-1">{this.props.hint ?? "Sprawdź JSON obok: ten fragment ma nietypową postać. Po poprawce spróbujemy ponownie."}</p>
          <p className="mt-1 font-mono text-xs break-all text-amber-900/80">{String(this.state.error?.message ?? this.state.error)}</p>
          <button
            type="button"
            onClick={() => this.setState({ error: null })}
            className="mt-3 rounded-lg border border-amber-400 bg-white px-3 py-1.5 font-semibold text-amber-950 hover:bg-amber-100"
          >
            Spróbuj ponownie
          </button>
        </div>
      </div>
    );
  }
}
