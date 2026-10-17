<script lang="ts">
	import GithubIcon from '~icons/simple-icons/github';
	import { t } from '../lib/i18n/index.js';
</script>

<footer class="w-full border-t border-border">
	<div class="w-full px-4 py-6">
		<div class="flex flex-col gap-2.5">
			<p class="text-sm font-semibold tracking-tight text-foreground">Fatih Yılmaz</p>
			<p class="max-w-md text-sm leading-relaxed text-muted-foreground">
				{$t('footer.description')}
			</p>
			<a
				href="https://github.com/queaxtra/tabler"
				target="_blank"
				rel="noreferrer"
				class="mt-1 inline-flex w-fit items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
			>
				<GithubIcon class="size-3.5" />
				{$t('footer.source')}
			</a>
		</div>
	</div>
</footer>
