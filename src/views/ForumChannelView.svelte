<script lang="ts">
	import { onMount } from 'svelte';
	import { getSDK } from '@zentra/plugin-sdk/runtime';

	const sdk = getSDK();
	const { activeChannel, activeChannelMessages } = sdk.stores;

	const TOPIC_PREFIX = '[forum-topic] ';

	let MessageListComponent: any = null;
	let MessageInputComponent: any = null;
	let creating = false;
	let topicTitle = '';
	let topicBody = '';

	$: topics = ($activeChannelMessages || [])
		.filter((msg) => (msg.content || '').startsWith(TOPIC_PREFIX))
		.map((msg) => ({
			id: msg.id,
			title: (msg.content || '').slice(TOPIC_PREFIX.length) || 'Untitled topic',
			author: msg.author,
			createdAt: msg.createdAt
		}));

	onMount(() => {
		sdk.components.MessageList().then((mod) => {
			MessageListComponent = mod.default;
		});
		sdk.components.MessageInput().then((mod) => {
			MessageInputComponent = mod.default;
		});

		return () => {
			MessageListComponent = null;
			MessageInputComponent = null;
		};
	});

	async function createTopic() {
		if (creating || !topicTitle.trim() || !$activeChannel?.id) return;
		creating = true;
		try {
			const content = topicBody.trim()
				? `${TOPIC_PREFIX}${topicTitle.trim()}\n\n${topicBody.trim()}`
				: `${TOPIC_PREFIX}${topicTitle.trim()}`;
			const message = await sdk.api.sendMessage($activeChannel.id, { content });
			sdk.ui.addMessage($activeChannel.id, message);
			topicTitle = '';
			topicBody = '';
		} catch (error) {
			console.error('Failed to create forum topic:', error);
			sdk.ui.addToast({ type: 'error', message: 'Failed to create topic' });
		} finally {
			creating = false;
		}
	}
</script>

<div class="flex-1 flex flex-col min-h-0">
	<div class="px-4 py-3 border-b border-border bg-surface space-y-2">
		<p class="text-sm text-text-muted">Forum topics are messages prefixed with <span class="font-mono">{TOPIC_PREFIX}</span>.</p>
		<div class="grid gap-2">
			<input
				bind:value={topicTitle}
				placeholder="Topic title"
				class="w-full rounded border border-border bg-background px-3 py-2 text-sm"
			/>
			<textarea
				bind:value={topicBody}
				rows={2}
				placeholder="Optional details"
				class="w-full rounded border border-border bg-background px-3 py-2 text-sm"
			></textarea>
			<div class="flex justify-end">
				<button
					type="button"
					on:click={createTopic}
					disabled={creating || !topicTitle.trim()}
					class="px-3 py-2 rounded bg-primary text-primary-foreground text-sm disabled:opacity-60"
				>
					{creating ? 'Creating...' : 'Create Topic'}
				</button>
			</div>
		</div>
	</div>

	{#if topics.length > 0}
		<div class="px-4 py-2 border-b border-border bg-background">
			<p class="text-xs text-text-muted uppercase tracking-wide mb-1">Recent topics</p>
			<div class="flex flex-wrap gap-2">
				{#each topics.slice(0, 8) as topic (topic.id)}
					<span class="px-2 py-1 rounded border border-border text-xs bg-surface text-text-secondary">
						{topic.title}
					</span>
				{/each}
			</div>
		</div>
	{/if}

	{#if MessageListComponent}
		{@const MessageList = MessageListComponent}
		<MessageList channelId={$activeChannel?.id ?? ''} />
	{/if}

	{#if MessageInputComponent}
		{@const MessageInput = MessageInputComponent}
		<MessageInput channelId={$activeChannel?.id ?? ''} />
	{/if}
</div>
